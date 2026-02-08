import nodemailer from 'nodemailer';
import { getEmailConfig, isSmtpConfigured, resolveMailProxy, createProxiedSocket } from './config';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  debugMode?: boolean;
  originalRecipient?: string;
}

async function createTransporter(teamId: string) {
  const config = await getEmailConfig(teamId);
  
  if (!(await isSmtpConfigured(teamId))) {
    throw new Error('SMTP is not configured. Go to Settings > Email to configure your SMTP server.');
  }

  const proxy = await resolveMailProxy(teamId, config.smtp.host);

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.auth.user,
      pass: config.smtp.auth.pass,
    },
    tls: {
      // Allow self-signed certificates for local development (e.g. hMailServer, MailHog)
      rejectUnauthorized: false,
      // Allow older TLS versions that local mail servers may use
      minVersion: 'TLSv1' as const,
    },
    // Tunnel through proxy if configured (SOCKS4/5 or HTTP CONNECT)
    ...(proxy ? {
      getSocket(_options: Record<string, unknown>, callback: (err: Error | null, socketOptions?: { connection: unknown }) => void) {
        createProxiedSocket(proxy, config.smtp.host, config.smtp.port)
          .then((socket) => callback(null, { connection: socket }))
          .catch((err) => callback(err));
      },
    } : {}),
  });
}

/**
 * Send an email. In debug mode, routes to the debug address instead.
 */
export async function sendEmail(teamId: string, options: SendEmailOptions): Promise<SendEmailResult> {
  const config = await getEmailConfig(teamId);
  
  let actualTo = options.to;
  let actualSubject = options.subject;
  let debugMode = false;
  let originalRecipient: string | undefined;

  // Debug mode: override recipient and mark subject
  if (config.debugMode && config.debugAddress) {
    originalRecipient = options.to;
    actualTo = config.debugAddress;
    actualSubject = `[DEBUG - To: ${originalRecipient}] ${options.subject}`;
    debugMode = true;
  }

  try {
    const transporter = await createTransporter(teamId);

    const info = await transporter.sendMail({
      from: config.from,
      to: actualTo,
      subject: actualSubject,
      html: options.html,
      text: options.text || stripHtml(options.html),
      replyTo: options.replyTo,
    });

    console.log(`📧 Email sent: ${info.messageId} | To: ${actualTo}${debugMode ? ` (debug, original: ${originalRecipient})` : ''}`);

    return {
      success: true,
      messageId: info.messageId,
      debugMode,
      originalRecipient,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Email send failed:`, errorMessage);
    
    return {
      success: false,
      error: errorMessage,
      debugMode,
      originalRecipient,
    };
  }
}

/**
 * Verify SMTP connection is working.
 */
export async function verifySmtpConnection(teamId: string): Promise<{ connected: boolean; error?: string }> {
  try {
    if (!(await isSmtpConfigured(teamId))) {
      return { connected: false, error: 'SMTP not configured' };
    }

    const transporter = await createTransporter(teamId);
    await transporter.verify();
    return { connected: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const config = await getEmailConfig(teamId).catch(() => null);
    
    // Provide more actionable error messages
    if (errorMessage.includes('ECONNREFUSED')) {
      return { connected: false, error: `Connection refused on ${config?.smtp.host}:${config?.smtp.port}. Make sure the SMTP server is running and the port is correct.` };
    }
    if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
      return { connected: false, error: `Connection timed out. Check that the host and port are correct and the server is reachable.` };
    }
    if (errorMessage.includes('wrong version number') || errorMessage.includes('Unexpected close')) {
      const suggestion = config?.smtp.secure
        ? `TLS/SSL handshake failed on port ${config?.smtp.port}. Try disabling "Use Secure Connection" for port 587/25, or use port 465 with it enabled.`
        : `Connection failed on port ${config?.smtp.port}. If using port 465, enable "Use Secure Connection".`;
      return { connected: false, error: suggestion };
    }
    if (errorMessage.includes('Invalid login') || errorMessage.includes('authentication') || errorMessage.includes('535')) {
      return { connected: false, error: 'Authentication failed. Check your username and password.' };
    }
    
    return { connected: false, error: errorMessage };
  }
}

/**
 * Strip HTML tags for plain text fallback.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '  • ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
