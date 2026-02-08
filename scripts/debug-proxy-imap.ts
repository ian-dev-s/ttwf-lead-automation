/**
 * Debug script to test IMAP through HTTP proxy step by step
 * Run with: npx tsx scripts/debug-proxy-imap.ts
 */

import * as net from 'net';
import * as tls from 'tls';

// Your proxy
const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 7897;

// IMAP server
const IMAP_HOST = 'imap.thetinywebfactory.com';
const IMAP_PORT = 993;

async function testHttpConnect() {
  console.log('=== Testing HTTP CONNECT Proxy ===\n');
  console.log(`Proxy: ${PROXY_HOST}:${PROXY_PORT}`);
  console.log(`Target: ${IMAP_HOST}:${IMAP_PORT}\n`);

  return new Promise<void>((resolve) => {
    // Step 1: Connect to the proxy
    console.log('Step 1: Connecting to proxy...');
    const proxySocket = net.createConnection({
      host: PROXY_HOST,
      port: PROXY_PORT,
    });

    proxySocket.setTimeout(10000);

    proxySocket.on('connect', () => {
      console.log('  Connected to proxy');
      
      // Step 2: Send HTTP CONNECT request
      console.log('\nStep 2: Sending CONNECT request...');
      const connectRequest = `CONNECT ${IMAP_HOST}:${IMAP_PORT} HTTP/1.1\r\nHost: ${IMAP_HOST}:${IMAP_PORT}\r\n\r\n`;
      console.log('  Request:', connectRequest.replace(/\r\n/g, '\\r\\n'));
      proxySocket.write(connectRequest);
    });

    let responseData = '';
    proxySocket.on('data', (chunk) => {
      responseData += chunk.toString();
      console.log('  Received:', chunk.toString().substring(0, 200));

      // Check if we got the full HTTP response
      if (responseData.includes('\r\n\r\n')) {
        const statusLine = responseData.split('\r\n')[0];
        console.log('\nStep 3: Parsing proxy response...');
        console.log('  Status:', statusLine);

        if (statusLine.includes('200')) {
          console.log('  Tunnel established!\n');
          
          // Step 4: Upgrade to TLS
          console.log('Step 4: Upgrading to TLS...');
          const tlsSocket = tls.connect({
            socket: proxySocket,
            host: IMAP_HOST,
            servername: IMAP_HOST,
            rejectUnauthorized: false,
            minVersion: 'TLSv1' as const,
          }, () => {
            console.log('  TLS handshake complete!');
            console.log('  Protocol:', tlsSocket.getProtocol());
            console.log('  Cipher:', tlsSocket.getCipher()?.name);
            
            // Wait for IMAP greeting
            console.log('\nStep 5: Waiting for IMAP greeting...');
          });

          tlsSocket.on('data', (data) => {
            console.log('  IMAP:', data.toString().substring(0, 100));
            console.log('\n✅ SUCCESS! IMAP connection through proxy works!');
            tlsSocket.destroy();
            resolve();
          });

          tlsSocket.on('error', (err) => {
            console.log('\n❌ TLS error:', err.message);
            resolve();
          });

          tlsSocket.on('close', () => {
            console.log('  TLS socket closed');
          });
        } else {
          console.log('\n❌ Proxy rejected CONNECT request');
          console.log('  Full response:', responseData);
          proxySocket.destroy();
          resolve();
        }
      }
    });

    proxySocket.on('error', (err) => {
      console.log('\n❌ Proxy socket error:', err.message);
      resolve();
    });

    proxySocket.on('timeout', () => {
      console.log('\n❌ Proxy connection timed out');
      proxySocket.destroy();
      resolve();
    });

    proxySocket.on('close', () => {
      console.log('Proxy socket closed');
    });
  });
}

testHttpConnect().then(() => {
  console.log('\nDone.');
  process.exit(0);
}).catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
