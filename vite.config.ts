import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Manually construct the object to be defined
  const processEnvValues: Record<string, string> = {};
  for (const key in env) {
    processEnvValues[`import.meta.env.${key}`] = JSON.stringify(env[key]);
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      __DUCK_UI_VERSION__: JSON.stringify(pkg.version),
      ...processEnvValues // Spread the processed variables
    },
  };
});