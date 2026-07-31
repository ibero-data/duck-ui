import { defineConfig } from '@playwright/test';

/**
 * E2E smoke tests against the REAL production build (`vite preview` serves
 * dist/ with the same COOP/COEP + CSP headers as the Docker image). Run
 * `bun run build` first; CI does.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 2 : 0,
  workers: 1, // OPFS/IndexedDB state is per-origin; serialize to keep runs deterministic
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:4599',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'bunx vite preview --port 4599 --strictPort',
    url: 'http://localhost:4599',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
