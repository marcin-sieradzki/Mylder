import { defineConfig, devices } from '@playwright/test'

// The production build serves the weekday recording, at the recording's moment, and a second
// server on the same build serves the simulation, to prove the default source starts.
// e2e/recording.ts names both.
const PORT = 4173
const SIMULATED_PORT = 4174

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // Optional override for sandboxes that ship a different Chromium build.
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Started in order, so the second server starts on the first one's build.
  webServer: [
    {
      command: `npm run build && npm start -- --port ${PORT}`,
      port: PORT,
      env: { MYLDER_SOURCE: 'recording:weekday' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm start -- --port ${SIMULATED_PORT}`,
      port: SIMULATED_PORT,
      env: { MYLDER_SOURCE: 'simulated' },
      reuseExistingServer: !process.env.CI,
    },
  ],
})
