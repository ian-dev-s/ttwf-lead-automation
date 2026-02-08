import { ImapFlow } from 'imapflow';
import { prisma } from '@/lib/db';
import { getImapConfig, isImapConfigured } from './config';

export interface FetchResult {
  fetched: number;
  matched: number;
  errors: string[];
}

/**
 * Creates an IMAP client connection for a team
 */
async function createImapClient(teamId: string): Promise<ImapFlow> {
  const config = await getImapConfig(teamId);
  
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.auth.user,
      pass: config.auth.pass,
    },
    logger: false,
  });
}

/**
 * Fetches new (unseen) emails from the IMAP inbox,
 * stores them in the InboundEmail table, and attempts to match them to leads.
 */
export async function fetchNewEmails(teamId: string): Promise<FetchResult> {
  if (!(await isImapConfigured(teamId))) {
    throw new Error('IMAP is not configured. Go to Settings > Email to configure your IMAP server.');
  }

  const result: FetchResult = {
    fetched: 0,
    matched: 0,
    errors: [],
  };

  const client = await createImapClient(teamId);

  try {
    await client.connect();
    
    // Open INBOX
    const lock = await client.getMailboxLock('INBOX');
    
    try {
      // Search for unseen messages
      const messages = client.fetch('1:*', {
        uid: true,
        flags: true,
        envelope: true,
        source: true,
      });

      for await (const msg of messages) {
        try {
          // Skip messages that are already seen
          if (msg.flags?.has('\\Seen')) {
            continue;
          }

          const envelope = msg.envelope;
          if (!envelope) continue;

          const messageId = envelope.messageId || `imap-${msg.uid}-${Date.now()}`;
          
          // Check if we already have this email
          const existing = await prisma.inboundEmail.findUnique({
            where: { messageId },
          });
          if (existing) continue;

          // Parse the email content
          const fromAddress = envelope.from?.[0]
            ? `${envelope.from[0].name || ''} <${envelope.from[0].address || ''}>`.trim()
            : 'Unknown';
          const fromEmail = envelope.from?.[0]?.address || '';
          const toAddress = envelope.to?.[0]
            ? `${envelope.to[0].name || ''} <${envelope.to[0].address || ''}>`.trim()
            : '';
          const subject = envelope.subject || '(No Subject)';
          const receivedAt = envelope.date || new Date();

          // Get the email body
          let bodyText = '';
          let bodyHtml = '';
          
          if (msg.source) {
            const source = msg.source.toString();
            bodyText = extractTextFromSource(source);
            bodyHtml = extractHtmlFromSource(source);
          }

          // Store the inbound email (team-scoped)
          const inboundEmail = await prisma.inboundEmail.create({
            data: {
              teamId,
              messageId,
              from: fromAddress,
              to: toAddress,
              subject,
              bodyText: bodyText || null,
              bodyHtml: bodyHtml || null,
              receivedAt: new Date(receivedAt),
            },
          });

          result.fetched++;

          // Try to match to a lead (team-scoped)
          if (fromEmail) {
            const matchedLead = await matchEmailToLead(teamId, fromEmail);
            if (matchedLead) {
              await prisma.inboundEmail.update({
                where: { id: inboundEmail.id },
                data: { leadId: matchedLead },
              });
              result.matched++;
            }
          }

          // Mark as seen in IMAP
          await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
        } catch (emailError) {
          const errMsg = emailError instanceof Error ? emailError.message : String(emailError);
          result.errors.push(`Error processing email: ${errMsg}`);
        }
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`IMAP fetch failed: ${errMsg}`);
  } finally {
    await client.logout().catch(() => {});
  }

  return result;
}

/**
 * Matches an email address to an existing lead by email or domain.
 * Returns the lead ID if found, null otherwise.
 */
async function matchEmailToLead(teamId: string, fromEmail: string): Promise<string | null> {
  // First try exact email match (team-scoped)
  const exactMatch = await prisma.lead.findFirst({
    where: { teamId, email: fromEmail },
    select: { id: true },
  });

  if (exactMatch) return exactMatch.id;

  // Try domain match
  const domain = fromEmail.split('@')[1];
  if (domain) {
    const domainMatch = await prisma.lead.findFirst({
      where: {
        teamId,
        OR: [
          { website: { contains: domain } },
          { email: { endsWith: `@${domain}` } },
        ],
      },
      select: { id: true },
    });

    if (domainMatch) return domainMatch.id;
  }

  return null;
}

/**
 * Test the IMAP connection for a team
 */
export async function verifyImapConnection(teamId: string): Promise<{ success: boolean; error?: string }> {
  if (!(await isImapConfigured(teamId))) {
    return { success: false, error: 'IMAP is not configured' };
  }

  const client = await createImapClient(teamId);

  try {
    await client.connect();
    await client.logout();
    return { success: true };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errMsg };
  }
}

/**
 * Simple text extraction from raw email source.
 */
function extractTextFromSource(source: string): string {
  const textMatch = source.match(
    /Content-Type:\s*text\/plain[^\r\n]*\r?\n(?:Content-Transfer-Encoding:\s*[^\r\n]*\r?\n)?(?:[^\r\n]*\r?\n)*?\r?\n([\s\S]*?)(?:\r?\n--|\r?\n\.\r?\n|$)/i
  );
  
  if (textMatch) {
    return decodeEmailBody(textMatch[1].trim());
  }

  const bodyStart = source.indexOf('\r\n\r\n');
  if (bodyStart > -1) {
    return decodeEmailBody(source.substring(bodyStart + 4).trim());
  }

  return '';
}

/**
 * Simple HTML extraction from raw email source.
 */
function extractHtmlFromSource(source: string): string {
  const htmlMatch = source.match(
    /Content-Type:\s*text\/html[^\r\n]*\r?\n(?:Content-Transfer-Encoding:\s*[^\r\n]*\r?\n)?(?:[^\r\n]*\r?\n)*?\r?\n([\s\S]*?)(?:\r?\n--|\r?\n\.\r?\n|$)/i
  );
  
  if (htmlMatch) {
    return decodeEmailBody(htmlMatch[1].trim());
  }

  return '';
}

/**
 * Basic email body decoder (handles quoted-printable and base64)
 */
function decodeEmailBody(body: string): string {
  // Handle quoted-printable
  if (body.includes('=\r\n') || body.includes('=\n') || body.match(/=[0-9A-F]{2}/)) {
    body = body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => 
        String.fromCharCode(parseInt(hex, 16))
      );
  }

  // Handle base64 (crude detection)
  if (/^[A-Za-z0-9+/\r\n]+=*$/.test(body.trim()) && body.length > 100) {
    try {
      body = Buffer.from(body.replace(/\r?\n/g, ''), 'base64').toString('utf-8');
    } catch {
      // Not actually base64, use as-is
    }
  }

  return body;
}
