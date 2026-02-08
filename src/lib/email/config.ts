// Server-side only - Email configuration from TeamSettings (database-backed)

import { prisma } from '@/lib/db';
import { decryptIfPresent, maskSecret } from '@/lib/crypto';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailConfig {
  smtp: SmtpConfig;
  from: string;
  debugMode: boolean;
  debugAddress: string;
}

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

/**
 * Get email config for a team from the database.
 * Decrypts SMTP credentials from TeamSettings.
 */
export async function getEmailConfig(teamId: string): Promise<EmailConfig> {
  const settings = await prisma.teamSettings.findUnique({
    where: { teamId },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPass: true,
      emailFrom: true,
      emailDebugMode: true,
      emailDebugAddress: true,
    },
  });

  const host = settings?.smtpHost || '';
  const port = settings?.smtpPort || 587;
  const secure = settings?.smtpSecure || false;
  const user = decryptIfPresent(settings?.smtpUser) || '';
  const pass = decryptIfPresent(settings?.smtpPass) || '';
  const from = settings?.emailFrom || '';
  const debugMode = settings?.emailDebugMode || false;
  const debugAddress = settings?.emailDebugAddress || '';

  return {
    smtp: { host, port, secure, auth: { user, pass } },
    from,
    debugMode,
    debugAddress,
  };
}

/**
 * Check if SMTP is configured for a team.
 */
export async function isSmtpConfigured(teamId: string): Promise<boolean> {
  const config = await getEmailConfig(teamId);
  return !!(config.smtp.host && config.smtp.auth.user && config.smtp.auth.pass);
}

/**
 * Returns a masked version of the SMTP config safe for displaying in UI.
 * Never returns raw passwords or tokens.
 */
export async function getMaskedSmtpConfig(teamId: string) {
  const settings = await prisma.teamSettings.findUnique({
    where: { teamId },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPass: true,
      emailFrom: true,
      emailDebugMode: true,
      emailDebugAddress: true,
    },
  });

  const decryptedUser = decryptIfPresent(settings?.smtpUser);
  const decryptedPass = decryptIfPresent(settings?.smtpPass);

  return {
    host: settings?.smtpHost || null,
    port: settings?.smtpPort || 587,
    secure: settings?.smtpSecure || false,
    user: maskSecret(decryptedUser),
    from: settings?.emailFrom || null,
    debugMode: settings?.emailDebugMode || false,
    debugAddress: settings?.emailDebugAddress || null,
    isConfigured: !!(settings?.smtpHost && decryptedUser && decryptedPass),
  };
}

/**
 * Get IMAP config for a team from the database.
 * Decrypts IMAP credentials from TeamSettings.
 */
export async function getImapConfig(teamId: string): Promise<ImapConfig> {
  const settings = await prisma.teamSettings.findUnique({
    where: { teamId },
    select: {
      imapHost: true,
      imapPort: true,
      imapSecure: true,
      imapUser: true,
      imapPass: true,
    },
  });

  const host = settings?.imapHost || '';
  const port = settings?.imapPort || 993;
  const secure = settings?.imapSecure !== false;
  const user = decryptIfPresent(settings?.imapUser) || '';
  const pass = decryptIfPresent(settings?.imapPass) || '';

  return {
    host,
    port,
    secure,
    auth: { user, pass },
  };
}

/**
 * Check if IMAP is configured for a team.
 */
export async function isImapConfigured(teamId: string): Promise<boolean> {
  const config = await getImapConfig(teamId);
  return !!(config.host && config.auth.user && config.auth.pass);
}

/**
 * Returns a masked version of the IMAP config safe for displaying in UI.
 */
export async function getMaskedImapConfig(teamId: string) {
  const settings = await prisma.teamSettings.findUnique({
    where: { teamId },
    select: {
      imapHost: true,
      imapPort: true,
      imapSecure: true,
      imapUser: true,
      imapPass: true,
    },
  });

  const decryptedUser = decryptIfPresent(settings?.imapUser);
  const decryptedPass = decryptIfPresent(settings?.imapPass);

  return {
    host: settings?.imapHost || null,
    port: settings?.imapPort || 993,
    secure: settings?.imapSecure !== false,
    user: maskSecret(decryptedUser),
    isConfigured: !!(settings?.imapHost && decryptedUser && decryptedPass),
  };
}
