import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      // production: nginx serves the backend's sitemap at /sitemap.xml
      '/sitemap.xml': { target: 'http://localhost:4000', rewrite: () => '/api/sitemap.xml' }
    }
  }
});
