import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.VLOGUP_URL ?? 'http://localhost:4173/vlogup/';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  use: { baseURL: BASE, ...devices['Pixel 7'], channel: process.env.PW_CHANNEL ?? 'chrome', acceptDownloads: true },
  webServer: process.env.VLOGUP_URL ? undefined : { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/vlogup/', reuseExistingServer: true },
});
