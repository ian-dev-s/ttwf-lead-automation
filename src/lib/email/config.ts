// Server-side only - Email configuration from TeamSettings (Firestore-backed)

import { teamSettingsDoc } from '@/lib/firebase/collections';
import { decryptIfPresent, maskSecret } from '@/lib/crypto';
import { SocksClient } from 'socks';
import type { Socket } from 'net';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const httpProxyClient = require('nodemailer/lib/smtp-connection/http-proxy-client');
import { promisify } from 'util';
const httpProxyClientAsync = promisify(httpProxyClient);

// ─── Types ──────────────────────────────────────────────────

export type ProxyMode = 'none' | 'system' | 'manual';

/** Resolved proxy for a specific connection (what we actually use). */
export interface ResolvedProxy {
  type: 'socks4' | 'socks5' | 'http';
  host: string;
  port: number;
  auth?: { user: string; pass: string };
}

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

// ─── SMTP / IMAP Config Helpers ─────────────────────────────

/**
 * Get email config for a team from Firestore.
 * Decrypts SMTP credentials from TeamSettings.
 */
export async function getEmailConfig(teamId: string): Promise<EmailConfig> {
  const settingsSnap = await teamSettingsDoc(teamId).get();
  const settings = settingsSnap.exists ? settingsSnap.data()! : null;

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
 */
export async function getMaskedSmtpConfig(teamId: string) {
  const settingsSnap = await teamSettingsDoc(teamId).get();
  const settings = settingsSnap.exists ? settingsSnap.data()! : null;

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
 * Get IMAP config for a team from Firestore.
 */
export async function getImapConfig(teamId: string): Promise<ImapConfig> {
  const settingsSnap = await teamSettingsDoc(teamId).get();
  const settings = settingsSnap.exists ? settingsSnap.data()! : null;

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
  const settingsSnap = await teamSettingsDoc(teamId).get();
  const settings = settingsSnap.exists ? settingsSnap.data()! : null;

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

// ─── Connection Proxy (Thunderbird-style) ───────────────────

/**
 * Parse a proxy URL string into a ResolvedProxy.
 * Supports http://, https://, socks5://, socks4://, socks:// URLs.
 */
function parseProxyUrl(proxyUrl: string): ResolvedProxy | null {
  try {
    const url = new URL(proxyUrl);
    const protocol = url.protocol.replace(':', '').toLowerCase();

    let type: ResolvedProxy['type'];
    if (protocol === 'socks5' || protocol === 'socks') {
      type = 'socks5';
    } else if (protocol === 'socks4') {
      type = 'socks4';
    } else if (protocol === 'http' || protocol === 'https') {
      type = 'http';
    } else {
      return null;
    }

    const host = url.hostname;
    const port = parseInt(url.port) || (type === 'http' ? 8080 : 1080);
    if (!host) return null;

    const config: ResolvedProxy = { type, host, port };
    if (url.username) {
      config.auth = {
        user: decodeURIComponent(url.username),
        pass: decodeURIComponent(url.password || ''),
      };
    }
    return config;
  } catch {
    return null;
  }
}

/**
 * Get system proxy from environment variables.
 * Checks ALL_PROXY, HTTPS_PROXY, HTTP_PROXY (case-insensitive).
 */
function getSystemProxy(): ResolvedProxy | null {
  const proxyUrl =
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (!proxyUrl) return null;
  return parseProxyUrl(proxyUrl);
}

/**
 * Check if a destination host is excluded from proxying.
 * Supports domain matching (.example.com), exact match, and CIDR is left for future.
 */
function isExcluded(destHost: string, noProxyFor: string | null): boolean {
  if (!noProxyFor) return false;

  // Always exclude localhost
  if (['localhost', '127.0.0.1', '::1'].includes(destHost)) return true;

  const exclusions = noProxyFor.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const hostLower = destHost.toLowerCase();

  for (const exclusion of exclusions) {
    // Exact match
    if (hostLower === exclusion) return true;
    // Domain suffix match: ".example.com" matches "sub.example.com"
    if (exclusion.startsWith('.') && hostLower.endsWith(exclusion)) return true;
    // Also match without leading dot: "example.com" matches "sub.example.com"
    if (!exclusion.startsWith('.') && (hostLower === exclusion || hostLower.endsWith('.' + exclusion))) return true;
  }

  return false;
}

/**
 * Resolve the proxy to use for a given mail connection (IMAP or SMTP).
 *
 * Priority for manual mode:
 *   1. SOCKS proxy (preferred for raw TCP like mail)
 *   2. HTTPS proxy (via HTTP CONNECT tunnel)
 *   3. HTTP proxy (via HTTP CONNECT tunnel)
 *
 * Returns null if no proxy should be used.
 */
export async function resolveMailProxy(
  teamId: string,
  destHost: string,
): Promise<ResolvedProxy | null> {
  const settingsSnap = await teamSettingsDoc(teamId).get();
  const settings = settingsSnap.exists ? settingsSnap.data()! : null;

  const mode: ProxyMode = (settings?.proxyMode as ProxyMode) || 'none';
  if (mode === 'none') return null;

  // Check exclusion list
  const noProxyFor = settings?.proxyNoProxyFor as string | null;
  if (isExcluded(destHost, noProxyFor)) {
    console.log(`[Proxy] Host ${destHost} is excluded from proxying`);
    return null;
  }

  if (mode === 'system') {
    const proxy = getSystemProxy();
    console.log(`[Proxy] System proxy resolved: ${proxy ? `${proxy.type}://${proxy.host}:${proxy.port}` : '(none)'}`);
    return proxy;
  }

  // Manual mode: prefer SOCKS > HTTPS > HTTP for mail (raw TCP)
  if (mode === 'manual') {
    // SOCKS proxy
    const socksHost = settings?.proxySocksHost as string | null;
    const socksPort = settings?.proxySocksPort as number | null;
    if (socksHost && socksPort) {
      const version = (settings?.proxySocksVersion as number) === 4 ? 'socks4' : 'socks5';
      console.log(`[Proxy] Using ${version}://${socksHost}:${socksPort} for mail`);
      return { type: version, host: socksHost, port: socksPort };
    }

    // HTTPS proxy (CONNECT tunnel)
    const useHttpForHttps = settings?.proxyUseHttpForHttps as boolean;
    const httpsHost = useHttpForHttps
      ? (settings?.proxyHttpHost as string | null)
      : (settings?.proxyHttpsHost as string | null);
    const httpsPort = useHttpForHttps
      ? (settings?.proxyHttpPort as number | null)
      : (settings?.proxyHttpsPort as number | null);

    if (httpsHost && httpsPort) {
      console.log(`[Proxy] Using http://${httpsHost}:${httpsPort} (CONNECT) for mail`);
      return { type: 'http', host: httpsHost, port: httpsPort };
    }

    // HTTP proxy as last resort
    const httpHost = settings?.proxyHttpHost as string | null;
    const httpPort = settings?.proxyHttpPort as number | null;
    if (httpHost && httpPort) {
      console.log(`[Proxy] Using http://${httpHost}:${httpPort} (CONNECT) for mail`);
      return { type: 'http', host: httpHost, port: httpPort };
    }

    console.log('[Proxy] Manual mode but no proxy hosts configured');
    return null;
  }

  return null;
}

/**
 * Build a proxy URL string for ImapFlow's `proxy` option.
 * Returns null if no proxy should be used.
 */
export async function getProxyUrl(teamId: string, destHost: string): Promise<string | null> {
  const proxy = await resolveMailProxy(teamId, destHost);
  if (!proxy) return null;

  const authPart = proxy.auth
    ? `${encodeURIComponent(proxy.auth.user)}:${encodeURIComponent(proxy.auth.pass)}@`
    : '';

  return `${proxy.type}://${authPart}${proxy.host}:${proxy.port}`;
}

/**
 * Get detected system proxy info for display in UI.
 */
export function getDetectedSystemProxy(): { url: string | null; type: string | null } {
  const proxyUrl =
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (!proxyUrl) return { url: null, type: null };

  const config = parseProxyUrl(proxyUrl);
  if (!config) return { url: proxyUrl, type: 'unknown' };

  const maskedUrl = config.auth
    ? `${config.type}://${config.auth.user}:****@${config.host}:${config.port}`
    : `${config.type}://${config.host}:${config.port}`;

  return { url: maskedUrl, type: config.type };
}

/**
 * Returns a masked version of the proxy config safe for displaying in UI.
 */
export async function getMaskedProxyConfig(teamId: string) {
  const settingsSnap = await teamSettingsDoc(teamId).get();
  const settings = settingsSnap.exists ? settingsSnap.data()! : null;

  return {
    mode: (settings?.proxyMode as ProxyMode) || 'none',
    httpHost: settings?.proxyHttpHost || null,
    httpPort: settings?.proxyHttpPort || null,
    useHttpForHttps: settings?.proxyUseHttpForHttps || false,
    httpsHost: settings?.proxyHttpsHost || null,
    httpsPort: settings?.proxyHttpsPort || null,
    socksHost: settings?.proxySocksHost || null,
    socksPort: settings?.proxySocksPort || null,
    socksVersion: settings?.proxySocksVersion || 5,
    noProxyFor: settings?.proxyNoProxyFor || '',
    dnsOverSocks: settings?.proxyDnsOverSocks || false,
  };
}

/**
 * Create a TCP socket tunneled through the resolved proxy.
 * Used by nodemailer's SMTP transport via getSocket callback.
 */
export async function createProxiedSocket(
  proxy: ResolvedProxy,
  destHost: string,
  destPort: number,
): Promise<Socket> {
  if (proxy.type === 'socks4' || proxy.type === 'socks5') {
    const proxyType = (proxy.type === 'socks4' ? 4 : 5) as 4 | 5;

    const connectionOpts: {
      proxy: { host: string; port: number; type: 4 | 5; userId?: string; password?: string };
      destination: { host: string; port: number };
      command: 'connect';
    } = {
      proxy: {
        host: proxy.host,
        port: proxy.port,
        type: proxyType,
      },
      destination: {
        host: destHost,
        port: destPort,
      },
      command: 'connect',
    };

    if (proxy.auth) {
      connectionOpts.proxy.userId = proxy.auth.user;
      connectionOpts.proxy.password = proxy.auth.pass;
    }

    const info = await SocksClient.createConnection(connectionOpts);
    return info.socket as Socket;
  }

  if (proxy.type === 'http') {
    const proxyUrl = proxy.auth
      ? `http://${encodeURIComponent(proxy.auth.user)}:${encodeURIComponent(proxy.auth.pass)}@${proxy.host}:${proxy.port}`
      : `http://${proxy.host}:${proxy.port}`;

    const socket = await httpProxyClientAsync(proxyUrl, destPort, destHost);
    return socket as Socket;
  }

  throw new Error(`Unsupported proxy type: ${proxy.type}`);
}
