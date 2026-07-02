import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:80',
    viewport: { width: 375, height: 812 },
    actionTimeout: 10000,
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
  },
});
