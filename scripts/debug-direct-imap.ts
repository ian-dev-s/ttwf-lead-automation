/**
 * Debug script to test IMAP directly (no proxy)
 * Run with: npx tsx scripts/debug-direct-imap.ts
 */

import * as tls from 'tls';

// IMAP server
const IMAP_HOST = 'imap.thetinywebfactory.com';
const IMAP_PORT = 993;

async function testDirect() {
  console.log('=== Testing Direct TLS Connection ===\n');
  console.log(`Target: ${IMAP_HOST}:${IMAP_PORT}\n`);

  return new Promise<void>((resolve) => {
    console.log('Connecting with TLS...');
    
    const tlsSocket = tls.connect({
      host: IMAP_HOST,
      port: IMAP_PORT,
      servername: IMAP_HOST,
      rejectUnauthorized: false,
      minVersion: 'TLSv1' as const,
    }, () => {
      console.log('TLS handshake complete!');
      console.log('Protocol:', tlsSocket.getProtocol());
      console.log('Cipher:', tlsSocket.getCipher()?.name);
      
      console.log('\nWaiting for IMAP greeting...');
    });

    tlsSocket.setTimeout(10000);

    tlsSocket.on('data', (data) => {
      console.log('IMAP:', data.toString().substring(0, 200));
      console.log('\n✅ SUCCESS! Direct IMAP connection works!');
      tlsSocket.destroy();
      resolve();
    });

    tlsSocket.on('error', (err) => {
      console.log('\n❌ Error:', err.message);
      resolve();
    });

    tlsSocket.on('timeout', () => {
      console.log('\n❌ Connection timed out');
      tlsSocket.destroy();
      resolve();
    });
  });
}

testDirect().then(() => {
  console.log('\nDone.');
  process.exit(0);
}).catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
