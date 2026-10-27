import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // Dev proxy: /api calls go to Express, so no CORS issues in development
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
