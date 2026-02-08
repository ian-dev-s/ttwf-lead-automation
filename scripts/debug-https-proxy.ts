/**
 * Test basic HTTPS through proxy - if this works, TLS through proxy is fine
 */

import * as http from 'http';
import * as net from 'net';
import * as tls from 'tls';

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 7897;

// Test HTTPS to a known good server
async function testHttps() {
  console.log('=== Test 1: HTTPS through proxy ===\n');
  
  return new Promise<void>((resolve) => {
    // First establish CONNECT tunnel
    const proxyReq = http.request({
      host: PROXY_HOST,
      port: PROXY_PORT,
      method: 'CONNECT',
      path: 'www.google.com:443',
    });

    proxyReq.on('connect', (res, socket) => {
      console.log('Proxy CONNECT response:', res.statusCode);
      
      if (res.statusCode === 200) {
        const tlsSocket = tls.connect({
          socket: socket,
          host: 'www.google.com',
          servername: 'www.google.com',
        }, () => {
          console.log('TLS connected to Google!');
          
          // Make HTTP request
          tlsSocket.write('GET / HTTP/1.1\r\nHost: www.google.com\r\nConnection: close\r\n\r\n');
        });

        tlsSocket.on('data', (data) => {
          const str = data.toString();
          console.log('Response:', str.substring(0, 100));
          console.log('\n✅ HTTPS through proxy works!\n');
          tlsSocket.destroy();
          resolve();
        });

        tlsSocket.on('error', (err) => {
          console.log('TLS error:', err.message);
          resolve();
        });
      }
    });

    proxyReq.on('error', (err) => {
      console.log('Proxy error:', err.message);
      resolve();
    });

    proxyReq.end();
  });
}

// Test raw TLS to IMAP port on a public IMAP server
async function testPublicImap() {
  console.log('=== Test 2: IMAP to imap.gmail.com through proxy ===\n');
  
  return new Promise<void>((resolve) => {
    const proxySocket = net.createConnection({ host: PROXY_HOST, port: PROXY_PORT });
    
    proxySocket.on('connect', () => {
      proxySocket.write('CONNECT imap.gmail.com:993 HTTP/1.1\r\nHost: imap.gmail.com:993\r\n\r\n');
    });

    let gotResponse = false;
    proxySocket.on('data', (chunk) => {
      if (!gotResponse) {
        const str = chunk.toString();
        if (str.includes('\r\n\r\n')) {
          gotResponse = true;
          console.log('Proxy response:', str.split('\r\n')[0]);
          
          if (str.includes('200')) {
            proxySocket.removeAllListeners('data');
            
            const tlsSocket = tls.connect({
              socket: proxySocket,
              host: 'imap.gmail.com',
              servername: 'imap.gmail.com',
            });

            tlsSocket.on('secureConnect', () => {
              console.log('TLS connected!');
            });

            tlsSocket.on('data', (data) => {
              console.log('Gmail IMAP:', data.toString().substring(0, 100));
              console.log('\n✅ Gmail IMAP through proxy works!\n');
              tlsSocket.destroy();
              resolve();
            });

            tlsSocket.on('error', (err) => {
              console.log('TLS error:', err.message);
              resolve();
            });

            setTimeout(() => {
              console.log('Timeout waiting for Gmail IMAP');
              resolve();
            }, 15000);
          }
        }
      }
    });

    proxySocket.on('error', (err) => {
      console.log('Socket error:', err.message);
      resolve();
    });
  });
}

// Test your IMAP server
async function testYourImap() {
  console.log('=== Test 3: IMAP to imap.thetinywebfactory.com through proxy ===\n');
  
  return new Promise<void>((resolve) => {
    const proxySocket = net.createConnection({ host: PROXY_HOST, port: PROXY_PORT });
    
    proxySocket.on('connect', () => {
      proxySocket.write('CONNECT imap.thetinywebfactory.com:993 HTTP/1.1\r\nHost: imap.thetinywebfactory.com:993\r\n\r\n');
    });

    let gotResponse = false;
    proxySocket.on('data', (chunk) => {
      if (!gotResponse) {
        const str = chunk.toString();
        if (str.includes('\r\n\r\n')) {
          gotResponse = true;
          console.log('Proxy response:', str.split('\r\n')[0]);
          
          if (str.includes('200')) {
            proxySocket.removeAllListeners('data');
            
            const tlsSocket = tls.connect({
              socket: proxySocket,
              host: 'imap.thetinywebfactory.com',
              servername: 'imap.thetinywebfactory.com',
            });

            tlsSocket.on('secureConnect', () => {
              console.log('TLS connected!');
            });

            tlsSocket.on('data', (data) => {
              console.log('Your IMAP:', data.toString().substring(0, 100));
              console.log('\n✅ Your IMAP through proxy works!');
              tlsSocket.destroy();
              resolve();
            });

            tlsSocket.on('error', (err) => {
              console.log('TLS error:', err.message);
              resolve();
            });

            setTimeout(() => {
              console.log('Timeout waiting for your IMAP');
              resolve();
            }, 15000);
          }
        }
      }
    });

    proxySocket.on('error', (err) => {
      console.log('Socket error:', err.message);
      resolve();
    });
  });
}

async function main() {
  await testHttps();
  await testPublicImap();
  await testYourImap();
  console.log('Done');
}

main();
