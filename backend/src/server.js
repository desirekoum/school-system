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
  const options = { cert: fs.readFileSync(TLS_CERT_FILE), key: fs.readFileSync(TLS_KEY_FILE), minVersion: 'TLSv1.2' };
  https.createServer(options, app).listen(port, host, () => console.log(`API listening on https://localhost:${port}`));
} else {
  app.listen(port, host, () => console.log(`API listening on http://localhost:${port} (put it behind HTTPS)`));
}
