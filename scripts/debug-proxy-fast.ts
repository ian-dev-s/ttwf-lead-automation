/**
 * Debug - start TLS immediately after CONNECT, no delay
 */

import * as net from 'net';
import * as tls from 'tls';

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 7897;
const IMAP_HOST = 'imap.thetinywebfactory.com';
const IMAP_PORT = 993;

async function test() {
  console.log('=== Fast TLS Test ===\n');

  return new Promise<void>((resolve) => {
    const startTime = Date.now();
    
    const proxySocket = net.createConnection({ host: PROXY_HOST, port: PROXY_PORT });
    proxySocket.setTimeout(60000);
    proxySocket.setNoDelay(true);

    proxySocket.on('connect', () => {
      console.log(`${Date.now() - startTime}ms: Connected to proxy`);
      proxySocket.write(`CONNECT ${IMAP_HOST}:${IMAP_PORT} HTTP/1.1\r\nHost: ${IMAP_HOST}:${IMAP_PORT}\r\n\r\n`);
    });

    let responseBuffer = Buffer.alloc(0);
    
    proxySocket.on('data', (chunk) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk]);
      const responseStr = responseBuffer.toString();
      
      if (responseStr.includes('\r\n\r\n')) {
        const headerEnd = responseBuffer.indexOf(Buffer.from('\r\n\r\n')) + 4;
        const remainingData = responseBuffer.slice(headerEnd);
        
        console.log(`${Date.now() - startTime}ms: Got response:`, responseStr.split('\r\n')[0]);
        
        if (responseStr.includes('200')) {
          // IMMEDIATELY start TLS - don't wait
          proxySocket.removeAllListeners('data');
          proxySocket.removeAllListeners('error');
          proxySocket.removeAllListeners('close');
          proxySocket.removeAllListeners('end');
          proxySocket.removeAllListeners('timeout');
          
          console.log(`${Date.now() - startTime}ms: Starting TLS NOW`);
          
          const tlsSocket = tls.connect({
            socket: proxySocket,
            host: IMAP_HOST,
            servername: IMAP_HOST,
            rejectUnauthorized: false,
            minVersion: 'TLSv1' as const,
          });

          // If we have remaining data, it might be needed
          if (remainingData.length > 0) {
            console.log(`Pushing ${remainingData.length} bytes of remaining data`);
            tlsSocket.push(remainingData);
          }
          
          tlsSocket.setTimeout(30000);
          
          tlsSocket.on('secureConnect', () => {
            console.log(`${Date.now() - startTime}ms: TLS CONNECTED!`);
            console.log('  Protocol:', tlsSocket.getProtocol());
          });
          
          tlsSocket.on('data', (data) => {
            console.log(`${Date.now() - startTime}ms: Got data:`, data.toString().substring(0, 100));
            console.log('\n✅ SUCCESS!');
            tlsSocket.destroy();
            resolve();
          });
          
          tlsSocket.on('error', (err) => {
            console.log(`${Date.now() - startTime}ms: TLS error:`, err.message);
            resolve();
          });
          
          tlsSocket.on('close', () => {
            console.log(`${Date.now() - startTime}ms: TLS closed`);
          });
        } else {
          console.log('CONNECT failed');
          resolve();
        }
      }
    });

    proxySocket.on('error', (e) => {
      console.log(`${Date.now() - startTime}ms: Socket error:`, e.message);
      resolve();
    });

    proxySocket.on('close', () => {
      console.log(`${Date.now() - startTime}ms: Socket closed`);
    });
  });
}

test().then(() => {
  console.log('Done');
  process.exit(0);
});
