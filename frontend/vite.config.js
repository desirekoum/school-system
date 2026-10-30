import fs from 'node:fs';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Dev certificate from `npm run dev-cert` (backend): the browser talks HTTPS to Vite,
// and Vite forwards /api to the HTTPS API, checking the API's certificate against the same file.
const cert = new URL('../certs/localhost.pem', import.meta.url);
const key = new URL('../certs/localhost-key.pem', import.meta.url);
const tls = fs.existsSync(cert) && fs.existsSync(key) ? { cert: fs.readFileSync(cert), key: fs.readFileSync(key) } : null;
if (!tls) console.warn('No certs/localhost.pem: run "npm run dev-cert" in backend/ for HTTPS');

const api = process.env.API_URL ?? (tls ? 'https://localhost:3000' : 'http://localhost:3000');

export default defineConfig({
  plugins: [vue()],
  // exceljs (~930 kB) is its own lazy chunk, loaded on the first Excel export only
  build: { chunkSizeWarningLimit: 1000 },
  // Pre-bundled at dev start, so the first export doesn't make Vite re-optimize and reload the page
  optimizeDeps: { include: ['exceljs'] },
  server: {
    https: tls ?? undefined,
    // Dev proxy: /api calls go to Express on the same origin, so the session cookie is first-party
    proxy: {
      '/api': {
        target: api,
        // Same CA as the API's self-signed certificate: TLS stays verified, no "rejectUnauthorized: false"
        ...(tls && api.startsWith('https') && { ca: tls.cert }),
      },
    },
  },
});
