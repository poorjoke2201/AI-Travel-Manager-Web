import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// Proxies /api during `npm run dev` so the client can call relative paths
// (services/api.js) without hardcoding a backend origin or fighting CORS
// in development. Production deploys should set VITE_API_URL instead
// (see services/api.js) and serve the built client separately.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    envDir: '..',
    plugins: [
      react(),
      cesium({ rebuildCesium: true }),
      {
        name: 'defer-cesium-widget-styles',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            return html.replace(
              /<link\b(?=[^>]*href=["']\/cesium\/Widgets\/widgets\.css["'])[^>]*>\s*/i,
              ''
            );
          },
        },
      },
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:5001',
          changeOrigin: true,
        },
      },
    },
  };
});