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

// On Windows, openssl is often not on the PATH but ships with Git for Windows
const candidates = ['openssl', ...(process.platform === 'win32' ? [
  path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'usr', 'bin', 'openssl.exe'),
  path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Git', 'usr', 'bin', 'openssl.exe'),
  path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'usr', 'bin', 'openssl.exe'),
] : [])];
const openssl = candidates.find((c) => {
  try { execFileSync(c, ['version'], { stdio: 'ignore' }); return true; } catch { return false; }
});
if (!openssl) {
  console.error('openssl was not found. Install Git for Windows (it includes openssl) or use mkcert:\n' +
    '  mkcert -install && mkcert -cert-file ../certs/localhost.pem -key-file ../certs/localhost-key.pem localhost 127.0.0.1');
  process.exit(1);
}

// A small config file instead of "-subj /CN=...": no shell or path rewriting issues on Windows
const conf = path.join(dir, 'openssl-dev.cnf');
fs.writeFileSync(conf, [
  '[req]', 'prompt = no', 'distinguished_name = dn', 'x509_extensions = ext',
  '[dn]', 'CN = localhost',
  '[ext]', 'subjectAltName = DNS:localhost,IP:127.0.0.1', 'basicConstraints = critical,CA:FALSE', 'extendedKeyUsage = serverAuth',
].join('\n'));
try {
  execFileSync(openssl, [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '825',
    '-keyout', key, '-out', cert, '-config', conf,
  ], { stdio: 'inherit' });
} finally {
  fs.rmSync(conf, { force: true });
}
console.log(`Created ${cert}\nand     ${key}`);
