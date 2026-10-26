import { defineConfig, devices } from '@playwright/test'
import { PORT, RECORDING, SIMULATED_PORT } from './e2e/recording'

// The production build serves the weekday recording, at the recording's moment, and a second
// server on the same build serves the simulation, to prove the default source starts.

export default defineConfig({
  testDir: './e2e',
  // The GitHub Pages demo's own tests run on its static build (playwright.demo.config.ts).
  testIgnore: 'demo/**',
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
      env: { MYLDER_SOURCE: `recording:${RECORDING}` },
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
