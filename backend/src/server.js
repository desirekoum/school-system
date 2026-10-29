import 'dotenv/config';
import fs from 'node:fs';
import https from 'node:https';
import { app } from './app.js';

const port = process.env.PORT ?? 3000;
const host = process.env.HOST;   // 127.0.0.1 behind a reverse proxy: not reachable from outside
const { TLS_CERT_FILE, TLS_KEY_FILE } = process.env;

// With a certificate, the API speaks HTTPS itself (TLS: encryption + server identity).
// Without one, it listens on plain HTTP and must sit behind an HTTPS reverse proxy (see README).
if (TLS_CERT_FILE && TLS_KEY_FILE) {
  // Missing files: stop with the fix instead of a raw ENOENT (never fall back to plain HTTP silently)
  const missing = [TLS_CERT_FILE, TLS_KEY_FILE].filter((f) => !fs.existsSync(f));
  if (missing.length) {
    console.error(`TLS certificate not found: ${missing.join(', ')}\n` +
      'Development: run "npm run dev-cert" in backend/ (from Git Bash on Windows if openssl is missing).\n' +
      'Behind an HTTPS reverse proxy: leave TLS_CERT_FILE and TLS_KEY_FILE empty in .env.');
    process.exit(1);
  }
  const options = { cert: fs.readFileSync(TLS_CERT_FILE), key: fs.readFileSync(TLS_KEY_FILE), minVersion: 'TLSv1.2' };
  https.createServer(options, app).listen(port, host, () => console.log(`API listening on https://localhost:${port}`));
} else {
  app.listen(port, host, () => console.log(`API listening on http://localhost:${port} (put it behind HTTPS)`));
}
