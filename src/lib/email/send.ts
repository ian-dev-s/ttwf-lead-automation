import nodemailer from 'nodemailer';
import { getEmailConfig, isSmtpConfigured } from './config';

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

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.auth.user,
      pass: config.smtp.auth.pass,
    },
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
