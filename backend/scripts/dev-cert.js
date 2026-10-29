/**
 * Development TLS certificate for https://localhost (browser → Vite and Vite → API both use it).
 * Self-signed: the browser warns once; for a trusted local certificate use mkcert instead
 * (mkcert -install && mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1).
 * Production uses a real certificate (Let's Encrypt through Caddy or certbot), never this one.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../certs');
fs.mkdirSync(dir, { recursive: true });
const cert = path.join(dir, 'localhost.pem');
const key = path.join(dir, 'localhost-key.pem');

execFileSync('openssl', [
  'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '825',
  '-keyout', key, '-out', cert, '-subj', '/CN=localhost',
  '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
], { stdio: 'inherit' });
console.log(`Created ${cert}\nand     ${key}`);
