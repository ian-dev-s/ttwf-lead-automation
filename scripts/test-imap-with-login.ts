/**
 * Test IMAP connection using the app's internal functions
 * This bypasses the UI and tests the actual connection logic
 * 
 * Run with: npx tsx scripts/test-imap-with-login.ts
 */

// Set up environment for Firebase emulators if needed
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';

import { ImapFlow } from 'imapflow';
import { getDetectedSystemProxy, getImapConfig, getProxyConfig, getProxyUrl } from '../src/lib/email/config';
import { verifyImapConnection } from '../src/lib/email/imap';

const TEAM_ID = 'demo-team'; // Adjust if your team ID is different

async function testProxyAndImap() {
  console.log('=== Testing Proxy and IMAP Configuration ===\n');

  // 1. Check system proxy detection
  console.log('--- System Proxy Detection ---');
  const systemProxy = getDetectedSystemProxy();
  console.log('System proxy URL:', systemProxy.url || '(none detected)');
  console.log('System proxy type:', systemProxy.type || 'N/A');

  // 2. Check proxy config from database
  console.log('\n--- Proxy Config from Database ---');
  try {
    const proxyConfig = await getProxyConfig(TEAM_ID);
    if (proxyConfig) {
      console.log('Proxy type:', proxyConfig.type);
      console.log('Proxy host:', proxyConfig.host);
      console.log('Proxy port:', proxyConfig.port);
      console.log('Proxy auth:', proxyConfig.auth ? 'yes' : 'no');
    } else {
      console.log('No proxy configured (direct connection)');
    }
  } catch (error) {
    console.log('Error fetching proxy config:', error instanceof Error ? error.message : error);
  }

  // 3. Check proxy URL that would be passed to ImapFlow
  console.log('\n--- Proxy URL for ImapFlow ---');
  try {
    const proxyUrl = await getProxyUrl(TEAM_ID);
    console.log('Proxy URL:', proxyUrl || '(none - direct connection)');
  } catch (error) {
    console.log('Error getting proxy URL:', error instanceof Error ? error.message : error);
  }

  // 4. Check IMAP config
  console.log('\n--- IMAP Config ---');
  try {
    const imapConfig = await getImapConfig(TEAM_ID);
    console.log('IMAP host:', imapConfig.host || '(not configured)');
    console.log('IMAP port:', imapConfig.port);
    console.log('IMAP secure:', imapConfig.secure);
    console.log('IMAP user:', imapConfig.auth.user ? `${imapConfig.auth.user.substring(0, 3)}...` : '(not configured)');
    console.log('IMAP pass:', imapConfig.auth.pass ? '(set)' : '(not configured)');

    if (!imapConfig.host || !imapConfig.auth.user) {
      console.log('\n⚠️  IMAP not fully configured. Skipping connection test.');
      return;
    }
  } catch (error) {
    console.log('Error fetching IMAP config:', error instanceof Error ? error.message : error);
    return;
  }

  // 5. Test IMAP connection using app's verify function
  console.log('\n--- Testing IMAP Connection ---');
  try {
    const result = await verifyImapConnection(TEAM_ID);
    if (result.success) {
      console.log('✅ IMAP connection successful!');
    } else {
      console.log('❌ IMAP connection failed:', result.error);
    }
  } catch (error) {
    console.log('❌ IMAP connection error:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.log('\nStack trace:');
      console.log(error.stack);
    }
  }

  // 6. Direct test with verbose logging
  console.log('\n--- Direct IMAP Test (verbose) ---');
  try {
    const imapConfig = await getImapConfig(TEAM_ID);
    const proxyUrl = await getProxyUrl(TEAM_ID);

    console.log('Creating ImapFlow client...');
    console.log('  Host:', imapConfig.host);
    console.log('  Port:', imapConfig.port);
    console.log('  Secure:', imapConfig.secure);
    console.log('  Proxy:', proxyUrl || '(direct)');

    const client = new ImapFlow({
      host: imapConfig.host,
      port: imapConfig.port,
      secure: imapConfig.secure,
      auth: {
        user: imapConfig.auth.user,
        pass: imapConfig.auth.pass,
      },
      ...(proxyUrl ? { proxy: proxyUrl } : {}),
      logger: {
        debug: (obj: unknown) => console.log('  [DEBUG]', JSON.stringify(obj)),
        info: (obj: unknown) => console.log('  [INFO]', JSON.stringify(obj)),
        warn: (obj: unknown) => console.log('  [WARN]', JSON.stringify(obj)),
        error: (obj: unknown) => console.log('  [ERROR]', JSON.stringify(obj)),
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1' as const,
      },
    });

    console.log('\nConnecting...');
    await client.connect();
    console.log('✅ Connected successfully!');
    await client.logout();
    console.log('Logged out.');
  } catch (error) {
    console.log('❌ Direct test failed:', error instanceof Error ? error.message : error);
  }
}

testProxyAndImap().then(() => {
  console.log('\n=== Test Complete ===');
  process.exit(0);
}).catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
