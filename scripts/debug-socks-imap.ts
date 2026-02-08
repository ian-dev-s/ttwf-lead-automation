/**
 * Debug script to test IMAP through SOCKS5 proxy
 * Run with: npx tsx scripts/debug-socks-imap.ts
 */

import { SocksClient, SocksClientOptions } from 'socks';
import * as tls from 'tls';

// SOCKS proxies - try common ports
const PROXY_HOST = '127.0.0.1';
const SOCKS_PORTS = [7898, 7891, 1080, 10808, 7899];

// IMAP server
const IMAP_HOST = 'imap.thetinywebfactory.com';
const IMAP_PORT = 993;

async function testSocks(socksPort: number): Promise<boolean> {
  console.log(`\n--- Testing SOCKS5 on port ${socksPort} ---`);

  const options: SocksClientOptions = {
    proxy: {
      host: PROXY_HOST,
      port: socksPort,
      type: 5,
    },
    command: 'connect',
    destination: {
      host: IMAP_HOST,
      port: IMAP_PORT,
    },
    timeout: 10000,
  };

  try {
    console.log('Step 1: Establishing SOCKS tunnel...');
    const { socket } = await SocksClient.createConnection(options);
    console.log('  ✓ SOCKS tunnel established');

    return new Promise<boolean>((resolve) => {
      console.log('Step 2: Starting TLS handshake...');
      
      const tlsSocket = tls.connect({
        socket: socket,
        host: IMAP_HOST,
        servername: IMAP_HOST,
        rejectUnauthorized: false,
        minVersion: 'TLSv1' as const,
      });

      tlsSocket.setTimeout(10000);

      tlsSocket.on('secureConnect', () => {
        console.log('  ✓ TLS handshake complete!');
        console.log('  Protocol:', tlsSocket.getProtocol());
        console.log('\nStep 3: Waiting for IMAP greeting...');
      });

      tlsSocket.on('data', (data) => {
        console.log('  IMAP:', data.toString().substring(0, 200));
        console.log('\n✅ SUCCESS on SOCKS port', socksPort);
        tlsSocket.destroy();
        resolve(true);
      });

      tlsSocket.on('error', (err) => {
        console.log('  ❌ TLS error:', err.message);
        resolve(false);
      });

      tlsSocket.on('timeout', () => {
        console.log('  ❌ TLS timeout');
        tlsSocket.destroy();
        resolve(false);
      });
    });
  } catch (err: any) {
    console.log('  ❌ SOCKS error:', err.message);
    return false;
  }
}

async function main() {
  console.log('=== Testing IMAP through SOCKS5 Proxy ===');
  console.log(`Target: ${IMAP_HOST}:${IMAP_PORT}`);
  console.log(`Testing SOCKS5 on ports: ${SOCKS_PORTS.join(', ')}`);

  for (const port of SOCKS_PORTS) {
    const success = await testSocks(port);
    if (success) {
      console.log(`\n🎉 Found working SOCKS port: ${port}`);
      console.log(`Configure your app to use SOCKS5 proxy at ${PROXY_HOST}:${port}`);
      break;
    }
  }

  console.log('\nDone.');
}

main().catch(console.error);
