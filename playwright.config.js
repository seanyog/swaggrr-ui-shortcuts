import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './test',
  timeout: 30_000,
  // Each test runs in its own worker → true parallel execution.
  // Workers is capped at 3 locally; CI typically runs 1 to avoid Xvfb contention.
  fullyParallel: true,
  workers: process.env.CI ? 1 : 3,
  // Extensions require a headed browser — headless mode doesn't support them.
  use: {
    headless: false,
  },
  webServer: {
    command: 'node test/server.mjs',
    port: 7474,
    reuseExistingServer: true,
  },
});
