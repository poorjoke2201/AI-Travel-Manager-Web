import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxies /api during `npm run dev` so the client can call relative paths
// (services/api.js) without hardcoding a backend origin or fighting CORS
// in development. Production deploys should set VITE_API_URL instead
// (see services/api.js) and serve the built client separately.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});