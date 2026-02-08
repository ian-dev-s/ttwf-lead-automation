/**
 * Test if the HTTP proxy port also accepts SOCKS5
 * Some proxies (like Clash) support multiple protocols on the same port
 */

import { SocksClient } from 'socks';
import * as tls from 'tls';

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 7897; // Same port as HTTP proxy
const IMAP_HOST = 'imap.thetinywebfactory.com';
const IMAP_PORT = 993;

async function testSocksOnHttpPort() {
  console.log('=== Testing SOCKS5 on HTTP Proxy Port ===\n');
  console.log(`Trying SOCKS5 on ${PROXY_HOST}:${PROXY_PORT}...\n`);

  try {
    const { socket } = await SocksClient.createConnection({
      proxy: {
        host: PROXY_HOST,
        port: PROXY_PORT,
        type: 5,
      },
      command: 'connect',
      destination: {
        host: IMAP_HOST,
        port: IMAP_PORT,
      },
      timeout: 10000,
    });

    console.log('✓ SOCKS5 tunnel established on same port!');
    
    return new Promise<void>((resolve) => {
      const tlsSocket = tls.connect({
        socket: socket,
        host: IMAP_HOST,
        servername: IMAP_HOST,
        rejectUnauthorized: false,
      });

      tlsSocket.on('secureConnect', () => {
        console.log('✓ TLS connected!');
      });

      tlsSocket.on('data', (data) => {
        console.log('IMAP:', data.toString().substring(0, 100));
        console.log('\n✅ SUCCESS! Your proxy supports SOCKS5 on the HTTP port!');
        tlsSocket.destroy();
        resolve();
      });

      tlsSocket.on('error', (err) => {
        console.log('TLS error:', err.message);
        resolve();
      });

      tlsSocket.setTimeout(10000);
      tlsSocket.on('timeout', () => {
        console.log('TLS timeout');
        tlsSocket.destroy();
        resolve();
      });
    });
  } catch (err: any) {
    console.log('SOCKS5 failed:', err.message);
    console.log('\nThe proxy does NOT support SOCKS5 on port 7897.');
  }
}

testSocksOnHttpPort().then(() => process.exit(0));
