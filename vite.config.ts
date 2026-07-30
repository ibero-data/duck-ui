import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Applied by `vite preview` and the Docker serve config (serve.json — keep the
// two in sync). Not applied to `vite dev`, whose HMR needs inline scripts.
// 'wasm-unsafe-eval' is DuckDB WASM; jsDelivr is the optional WASM CDN mode;
// broad connect-src is the point of the app (httpfs reads, external servers,
// AI providers). No 'unsafe-inline' for scripts — env.js is a real file.
const CSP = [
  "default-src 'self'",
  "script-src 'self' blob: 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: http: data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export default defineConfig(({ mode }) => {
  // Only load DUCK_UI_ prefixed env vars to prevent leaking CI secrets
  // (e.g., GITHUB_TOKEN, GHCR_PAT) into the JS bundle
  const env = loadEnv(mode, process.cwd(), 'DUCK_UI_');
  const buildDuckdbCdnOnly = env.DUCK_UI_DUCKDB_WASM_CDN_ONLY === 'true';

  // Manually construct the object to be defined
  // Filter out keys with invalid JS identifier characters (fixes Windows builds where
  // env vars like "=::" exist). See: https://github.com/caioricciuti/duck-ui/issues/26
  const processEnvValues: Record<string, string> = {};
  for (const key in env) {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      processEnvValues[`import.meta.env.${key}`] = JSON.stringify(env[key]);
    }
  }

  return {
    base: process.env.DUCK_UI_BASEPATH ?? '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo.png', 'logo-padding.png', 'logo-192.png', 'badge.svg'],
        manifest: {
          name: 'Duck-UI',
          short_name: 'Duck-UI',
          description:
            'DuckDB in your browser — SQL editor, notebooks, charts, and AI, fully local.',
          theme_color: '#0a0a0a',
          background_color: '#0a0a0a',
          display: 'standalone',
          start_url: '.',
          icons: [
            { src: 'logo-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'logo-padding.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'logo-padding.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Precache the app shell (JS/CSS/HTML). The multi-MB DuckDB WASM
          // binaries and AI models are cached at runtime on first use instead
          // of forcing every visitor through a huge install — after one query
          // (and one Brain load, if used) the app works fully offline.
          globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
          globIgnores: ['**/env.js'],
          maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              // Same-origin WASM (DuckDB engine bundles)
              urlPattern: /\.wasm$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'duckui-wasm',
                expiration: { maxEntries: 12 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/(community-)?extensions\.duckdb\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'duckdb-extensions',
                expiration: { maxEntries: 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'jsdelivr-cdn',
                expiration: { maxEntries: 40 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Content-Security-Policy': CSP,
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      __DUCK_UI_VERSION__: JSON.stringify(pkg.version),
      __DUCK_UI_RELEASE_DATE__: JSON.stringify(pkg.release_date),
      __DUCK_UI_BUILD_DUCKDB_CDN_ONLY__: JSON.stringify(buildDuckdbCdnOnly),
      ...processEnvValues // Spread the processed variables
    },
  };
});
