/**
 * Debug script to test IMAP connection through system proxy
 * Run with: npx tsx scripts/test-proxy-imap.ts
 */

import { ImapFlow } from 'imapflow';

// Get system proxy from env
const proxyUrl = 
  process.env.ALL_PROXY || 
  process.env.all_proxy ||
  process.env.HTTPS_PROXY || 
  process.env.https_proxy ||
  process.env.HTTP_PROXY || 
  process.env.http_proxy;

console.log('=== System Proxy Debug ===\n');
console.log('Detected proxy URL:', proxyUrl || '(none)');

// Parse proxy URL
function parseProxyUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'http:' ? '8080' : '1080'),
      username: parsed.username || null,
      password: parsed.password ? '****' : null,
    };
  } catch (e) {
    return { error: String(e) };
  }
}

if (proxyUrl) {
  console.log('Parsed proxy:', parseProxyUrl(proxyUrl));
}

// IMAP config - replace with your actual values
const IMAP_CONFIG = {
  host: 'imap.thetinywebfactory.com',
  port: 993,
  secure: true,
  user: 'YOUR_EMAIL_HERE',
  pass: 'YOUR_PASSWORD_HERE',
};

async function testImapWithProxy() {
  if (!proxyUrl) {
    console.log('\n❌ No system proxy detected. Set HTTP_PROXY, HTTPS_PROXY, or ALL_PROXY.');
    return;
  }

  if (IMAP_CONFIG.user === 'YOUR_EMAIL_HERE') {
    console.log('\n⚠️  Please edit the script and set your IMAP credentials.');
    console.log('   Then run: npx tsx scripts/test-proxy-imap.ts');
    return;
  }

  console.log('\n=== Testing IMAP through proxy ===');
  console.log('IMAP Server:', `${IMAP_CONFIG.host}:${IMAP_CONFIG.port}`);
  console.log('Proxy URL for ImapFlow:', proxyUrl);

  try {
    const client = new ImapFlow({
      host: IMAP_CONFIG.host,
      port: IMAP_CONFIG.port,
      secure: IMAP_CONFIG.secure,
      auth: {
        user: IMAP_CONFIG.user,
        pass: IMAP_CONFIG.pass,
      },
      proxy: proxyUrl,
      logger: {
        debug: (obj: unknown) => console.log('[DEBUG]', JSON.stringify(obj)),
        info: (obj: unknown) => console.log('[INFO]', JSON.stringify(obj)),
        warn: (obj: unknown) => console.log('[WARN]', JSON.stringify(obj)),
        error: (obj: unknown) => console.log('[ERROR]', JSON.stringify(obj)),
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1' as const,
      },
    });

    console.log('\nConnecting...');
    await client.connect();
    console.log('✅ IMAP connection successful through proxy!');
    await client.logout();
  } catch (error) {
    console.log('\n❌ IMAP connection failed:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.log('\nStack trace:');
      console.log(error.stack);
    }
  }
}

testImapWithProxy().then(() => {
  console.log('\nDone.');
  process.exit(0);
}).catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
