import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3211', viewport: { width: 390, height: 844 } },
  webServer: {
    command: 'node test/browser/static-server.js',
    url: 'http://127.0.0.1:3211',
    reuseExistingServer: false,
  },
});