import { defineConfig, devices } from '@playwright/test'
import {
  CROWDED,
  CROWDED_PORT,
  PORT,
  RECORDING,
  SIMULATED_PORT,
  SNAPSHOT_PORT,
} from './e2e/recording'

// The production build serves the weekday recording, at the recording's moment, its aircraft
// too, and a second server on the same build serves the simulation, to prove the default source
// starts, with the aircraft off, so no test calls adsb.lol. A third serves the recording to the
// snapshot route's tests alone, whose run they count, so no other test's stop or vehicle can
// spend a call they don't expect, however the tests are ordered. A fourth serves the crowded
// recording, where more trains stand at one stop than its panel lists before "Show all".

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
  // Started in order, so the others start on the first one's build.
  webServer: [
    {
      command: `npm run build && npm start -- --port ${PORT}`,
      port: PORT,
      env: {
        MYLDER_SOURCE: `recording:${RECORDING}`,
        MYLDER_AIRCRAFT_SOURCE: `recording:${RECORDING}`,
      },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm start -- --port ${SIMULATED_PORT}`,
      port: SIMULATED_PORT,
      env: { MYLDER_SOURCE: 'simulated', MYLDER_AIRCRAFT_SOURCE: 'off' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm start -- --port ${SNAPSHOT_PORT}`,
      port: SNAPSHOT_PORT,
      env: { MYLDER_SOURCE: `recording:${RECORDING}`, MYLDER_AIRCRAFT_SOURCE: 'off' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm start -- --port ${CROWDED_PORT}`,
      port: CROWDED_PORT,
      env: { MYLDER_SOURCE: `recording:${CROWDED}`, MYLDER_AIRCRAFT_SOURCE: 'off' },
      reuseExistingServer: !process.env.CI,
    },
  ],
})
