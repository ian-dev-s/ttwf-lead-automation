/**
 * Debug script to test IMAP through HTTP proxy - verbose TLS debug
 * Run with: npx tsx scripts/debug-proxy-imap2.ts
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
  console.log('=== Testing HTTP CONNECT Proxy (Verbose) ===\n');
  console.log(`Proxy: ${PROXY_HOST}:${PROXY_PORT}`);
  console.log(`Target: ${IMAP_HOST}:${IMAP_PORT}\n`);

  return new Promise<void>((resolve) => {
    console.log('Step 1: Connecting to proxy...');
    const proxySocket = net.createConnection({
      host: PROXY_HOST,
      port: PROXY_PORT,
    });

    proxySocket.setTimeout(30000);
    proxySocket.setNoDelay(true);

    proxySocket.on('connect', () => {
      console.log('  Connected to proxy');
      
      console.log('\nStep 2: Sending CONNECT request...');
      const connectRequest = `CONNECT ${IMAP_HOST}:${IMAP_PORT} HTTP/1.1\r\nHost: ${IMAP_HOST}:${IMAP_PORT}\r\n\r\n`;
      proxySocket.write(connectRequest);
    });

    let responseData = '';
    let tunnelEstablished = false;

    proxySocket.on('data', (chunk) => {
      if (!tunnelEstablished) {
        responseData += chunk.toString();
        console.log('  Received from proxy:', JSON.stringify(chunk.toString()));

        if (responseData.includes('\r\n\r\n')) {
          const statusLine = responseData.split('\r\n')[0];
          console.log('  Status:', statusLine);

          if (statusLine.includes('200')) {
            tunnelEstablished = true;
            console.log('  ✓ Tunnel established\n');
            
            // Check if there's any remaining data after headers
            const headerEndIndex = responseData.indexOf('\r\n\r\n') + 4;
            const remainingData = responseData.slice(headerEndIndex);
            if (remainingData.length > 0) {
              console.log('  Remaining data after headers:', JSON.stringify(remainingData));
            }

            // Remove all listeners before wrapping
            proxySocket.removeAllListeners('data');
            proxySocket.removeAllListeners('error');
            proxySocket.removeAllListeners('close');
            proxySocket.removeAllListeners('end');

            console.log('Step 3: Starting TLS handshake...');
            console.log('  Socket state - readable:', proxySocket.readable, 'writable:', proxySocket.writable);
            
            const tlsSocket = tls.connect({
              socket: proxySocket,
              host: IMAP_HOST,
              servername: IMAP_HOST,
              rejectUnauthorized: false,
              minVersion: 'TLSv1' as const,
            });

            tlsSocket.setTimeout(30000);

            tlsSocket.on('secureConnect', () => {
              console.log('  ✓ TLS handshake complete!');
              console.log('  Protocol:', tlsSocket.getProtocol());
              console.log('  Authorized:', tlsSocket.authorized);
              console.log('\nStep 4: Waiting for IMAP greeting...');
            });

            tlsSocket.on('data', (data) => {
              console.log('  IMAP:', data.toString().substring(0, 200));
              console.log('\n✅ SUCCESS!');
              tlsSocket.destroy();
              resolve();
            });

            tlsSocket.on('error', (err) => {
              console.log('\n❌ TLS error:', err.message);
              console.log('  Code:', (err as any).code);
              resolve();
            });

            tlsSocket.on('close', (hadError) => {
              console.log('  TLS socket closed, hadError:', hadError);
            });

            tlsSocket.on('end', () => {
              console.log('  TLS socket ended');
            });
          } else {
            console.log('\n❌ Proxy rejected CONNECT');
            proxySocket.destroy();
            resolve();
          }
        }
      } else {
        // This shouldn't happen - data after we've already wrapped in TLS
        console.log('  Unexpected data after tunnel:', JSON.stringify(chunk.toString()));
      }
    });

    proxySocket.on('error', (err) => {
      console.log('\n❌ Proxy socket error:', err.message);
      resolve();
    });

    proxySocket.on('timeout', () => {
      console.log('\n❌ Proxy timeout');
      proxySocket.destroy();
      resolve();
    });

    proxySocket.on('close', (hadError) => {
      console.log('Proxy socket closed, hadError:', hadError);
    });

    proxySocket.on('end', () => {
      console.log('Proxy socket ended');
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
