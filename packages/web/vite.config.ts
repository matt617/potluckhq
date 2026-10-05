import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// For local development, point VITE_PROXY_TARGET at a deployed CloudFront origin,
// e.g. VITE_PROXY_TARGET=https://d123.cloudfront.net npm run dev:web
const target = process.env.VITE_PROXY_TARGET;
const proxied = target
  ? Object.fromEntries(
      ['/api', '/public', '/config.json'].map((p) => [p, { target, changeOrigin: true, secure: true }]),
    )
  : undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: true, proxy: proxied },
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
});
