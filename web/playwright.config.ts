import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E test configuration for the Webmail project.
 *
 * Prerequisites — make sure the following are running before executing tests:
 *   1. Go backend:  `just dev`   (or: cd .. && go run ./cmd/webmail-api)
 *   2. Vite dev:    `just dev-ui` (or: cd web && npm run dev)
 *
 * The webServer blocks below will attempt to start both servers automatically,
 * but `reuseExistingServer: true` means they are skipped when already running.
 */
export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
  },

  webServer: [
    {
      command: 'cd .. && go run ./cmd/webmail-api',
      port: 8095,
      timeout: 60_000,
      reuseExistingServer: true,
      env: {
        WEBMAIL_LISTEN_ADDR: ':8095',
        WEBMAIL_DATABASE_URL: 'postgres://webmail:webmail@10.10.10.200:5432/webmail',
        WEBMAIL_CORE_API_URL: 'http://10.10.10.200:8090',
        WEBMAIL_API_KEY: 'dev-webmail-key-000000000000000000',
        SECRET_ENCRYPTION_KEY: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        VALKEY_URL: 'redis://127.0.0.1:6379/0',
        TEMPORAL_ADDRESS: 'localhost:7233',
      },
    },
    {
      command: 'node --max-http-header-size=65536 ./node_modules/.bin/vite',
      port: 5173,
      timeout: 30_000,
      reuseExistingServer: true,
    },
  ],

  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
