/**
 * Debug - send raw TLS ClientHello and see what comes back
 */

import * as crypto from 'crypto';
import * as net from 'net';

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 7897;
const IMAP_HOST = 'imap.thetinywebfactory.com';
const IMAP_PORT = 993;

// Minimal TLS 1.2 ClientHello
function buildClientHello(serverName: string): Buffer {
  // SNI extension
  const serverNameBytes = Buffer.from(serverName, 'ascii');
  const sniExtension = Buffer.concat([
    Buffer.from([0x00, 0x00]), // Extension type: SNI
    Buffer.from([((serverNameBytes.length + 5) >> 8) & 0xff, (serverNameBytes.length + 5) & 0xff]), // Extension length
    Buffer.from([((serverNameBytes.length + 3) >> 8) & 0xff, (serverNameBytes.length + 3) & 0xff]), // SNI list length
    Buffer.from([0x00]), // Host name type
    Buffer.from([(serverNameBytes.length >> 8) & 0xff, serverNameBytes.length & 0xff]), // Host name length
    serverNameBytes,
  ]);

  // Supported versions extension (TLS 1.2)
  const supportedVersions = Buffer.from([
    0x00, 0x2b, // Extension type: supported_versions
    0x00, 0x03, // Length
    0x02, // Supported versions length
    0x03, 0x03, // TLS 1.2
  ]);

  const extensions = Buffer.concat([sniExtension, supportedVersions]);

  // ClientHello
  const random = crypto.randomBytes(32);
  const sessionId = Buffer.from([0x00]); // Empty session ID
  const cipherSuites = Buffer.from([
    0x00, 0x02, // Length
    0x00, 0x2f, // TLS_RSA_WITH_AES_128_CBC_SHA
  ]);
  const compressionMethods = Buffer.from([0x01, 0x00]); // No compression

  const clientHelloBody = Buffer.concat([
    Buffer.from([0x03, 0x03]), // Version: TLS 1.2
    random,
    sessionId,
    cipherSuites,
    compressionMethods,
    Buffer.from([(extensions.length >> 8) & 0xff, extensions.length & 0xff]),
    extensions,
  ]);

  // Handshake header
  const handshake = Buffer.concat([
    Buffer.from([0x01]), // ClientHello
    Buffer.from([0x00, (clientHelloBody.length >> 8) & 0xff, clientHelloBody.length & 0xff]),
    clientHelloBody,
  ]);

  // Record header
  const record = Buffer.concat([
    Buffer.from([0x16]), // Content type: Handshake
    Buffer.from([0x03, 0x01]), // Version: TLS 1.0 (for compatibility)
    Buffer.from([(handshake.length >> 8) & 0xff, handshake.length & 0xff]),
    handshake,
  ]);

  return record;
}

async function test() {
  console.log('=== Raw TLS Test ===\n');

  return new Promise<void>((resolve) => {
    const startTime = Date.now();
    
    const proxySocket = net.createConnection({ host: PROXY_HOST, port: PROXY_PORT });
    proxySocket.setTimeout(30000);
    proxySocket.setNoDelay(true);

    proxySocket.on('connect', () => {
      console.log(`${Date.now() - startTime}ms: Connected to proxy`);
      proxySocket.write(`CONNECT ${IMAP_HOST}:${IMAP_PORT} HTTP/1.1\r\nHost: ${IMAP_HOST}:${IMAP_PORT}\r\n\r\n`);
    });

    let gotResponse = false;
    
    proxySocket.on('data', (chunk) => {
      if (!gotResponse) {
        const str = chunk.toString();
        if (str.includes('\r\n\r\n')) {
          gotResponse = true;
          console.log(`${Date.now() - startTime}ms: Got response:`, str.split('\r\n')[0]);
          
          if (str.includes('200')) {
            // Send raw ClientHello
            const clientHello = buildClientHello(IMAP_HOST);
            console.log(`${Date.now() - startTime}ms: Sending ClientHello (${clientHello.length} bytes)`);
            console.log('  First 20 bytes:', clientHello.slice(0, 20).toString('hex'));
            proxySocket.write(clientHello);
          }
        }
      } else {
        // This is a response to our ClientHello
        console.log(`${Date.now() - startTime}ms: Received ${chunk.length} bytes`);
        if (chunk[0] === 0x16) {
          console.log('  TLS Handshake record!');
        } else if (chunk[0] === 0x15) {
          console.log('  TLS Alert! Alert level:', chunk[1], 'description:', chunk[2]);
        } else {
          console.log('  Unknown:', chunk.slice(0, 20).toString('hex'));
        }
        proxySocket.destroy();
        resolve();
      }
    });

    proxySocket.on('error', (e) => {
      console.log(`${Date.now() - startTime}ms: Socket error:`, e.message);
      resolve();
    });

    proxySocket.on('close', () => {
      console.log(`${Date.now() - startTime}ms: Socket closed`);
      resolve();
    });

    proxySocket.on('end', () => {
      console.log(`${Date.now() - startTime}ms: Socket ended`);
    });
  });
}

test().then(() => {
  console.log('Done');
  process.exit(0);
});
