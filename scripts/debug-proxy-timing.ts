/**
 * Debug proxy timing - what happens after CONNECT succeeds?
 */

import * as net from 'net';
import * as tls from 'tls';

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 7897;
const IMAP_HOST = 'imap.thetinywebfactory.com';
const IMAP_PORT = 993;

async function test() {
  console.log('=== Proxy Timing Test ===\n');

  return new Promise<void>((resolve) => {
    const proxySocket = net.createConnection({ host: PROXY_HOST, port: PROXY_PORT });
    proxySocket.setTimeout(60000);

    proxySocket.on('connect', () => {
      console.log('Connected to proxy');
      proxySocket.write(`CONNECT ${IMAP_HOST}:${IMAP_PORT} HTTP/1.1\r\nHost: ${IMAP_HOST}:${IMAP_PORT}\r\n\r\n`);
    });

    let responseData = '';
    let gotResponse = false;
    
    proxySocket.on('data', (chunk) => {
      if (!gotResponse) {
        responseData += chunk.toString();
        if (responseData.includes('\r\n\r\n')) {
          gotResponse = true;
          console.log('Got CONNECT response:', responseData.split('\r\n')[0]);
          
          if (responseData.includes('200')) {
            console.log('\nTunnel established. Now watching socket state...');
            
            // Don't start TLS - just watch what happens
            let seconds = 0;
            const interval = setInterval(() => {
              seconds++;
              console.log(`${seconds}s - readable: ${proxySocket.readable}, writable: ${proxySocket.writable}, destroyed: ${proxySocket.destroyed}`);
              
              if (seconds >= 10) {
                clearInterval(interval);
                console.log('\n10 seconds passed without disconnect. Now testing TLS...');
                
                // Now try TLS
                proxySocket.removeAllListeners('data');
                proxySocket.removeAllListeners('error');
                proxySocket.removeAllListeners('close');
                proxySocket.removeAllListeners('end');
                
                const tlsSocket = tls.connect({
                  socket: proxySocket,
                  host: IMAP_HOST,
                  servername: IMAP_HOST,
                  rejectUnauthorized: false,
                });
                
                tlsSocket.on('secureConnect', () => {
                  console.log('TLS connected!');
                });
                
                tlsSocket.on('data', (d) => {
                  console.log('Data:', d.toString().substring(0, 100));
                  tlsSocket.destroy();
                  resolve();
                });
                
                tlsSocket.on('error', (e) => {
                  console.log('TLS error:', e.message);
                  resolve();
                });
              }
            }, 1000);
          } else {
            console.log('CONNECT failed');
            resolve();
          }
        }
      }
    });

    proxySocket.on('error', (e) => {
      console.log('Socket error:', e.message);
      resolve();
    });

    proxySocket.on('close', () => {
      console.log('Socket closed!');
    });

    proxySocket.on('end', () => {
      console.log('Socket ended!');
    });
  });
}

test().then(() => {
  console.log('Done');
  process.exit(0);
});
