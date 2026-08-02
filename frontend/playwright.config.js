import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE } from './e2e/storage-state.js';

export default defineConfig({
  testDir: '.',
  testMatch: ['tests/**/*.spec.js', 'e2e/**/*.spec.js'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    // Logs in once and stores the session. The backend allows only 5 auth
    // requests/minute, so a suite that logs in per test 429s itself.
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },
    {
      name: 'chromium',
      // Deliberately NOT storageState here. Some specs must start logged OUT --
      // real-flows.spec.js asserts that anonymous callers are rejected and that
      // a wrong password does not get in. A project-wide session silently
      // defeats exactly the tests whose job is to prove auth works.
      // Specs that need a session opt in with `test.use({ storageState })`.
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
