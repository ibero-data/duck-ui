import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Manually construct the object to be defined
  // Filter out keys with invalid JS identifier characters (fixes Windows builds where
  // env vars like "=::" exist). See: https://github.com/ibero-data/duck-ui/issues/26
  const processEnvValues: Record<string, string> = {};
  for (const key in env) {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      processEnvValues[`import.meta.env.${key}`] = JSON.stringify(env[key]);
    }
  }

  return {
    base: process.env.DUCK_UI_BASEPATH ?? '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      __DUCK_UI_VERSION__: JSON.stringify(pkg.version),
      __DUCK_UI_RELEASE_DATE__: JSON.stringify(pkg.release_date),
      ...processEnvValues // Spread the processed variables
    },
  };
});