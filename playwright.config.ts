import { defineConfig, devices } from '@playwright/test'
import {
  CROWDED,
  CROWDED_PORT,
  DEFAULT_PORT,
  PORT,
  RECORDING,
  SIMULATED_PORT,
  SNAPSHOT_PORT,
  UPDATES,
  UPDATES_PORT,
} from './e2e/recording'

// The production build serves the weekday recording, at the recording's moment, its aircraft
// too, and a second server on the same build runs with MYLDER_SOURCE unset, as a deployment that
// forgets it would, to prove the default source, the timetable, starts. A third serves the
// recording to the snapshot route's tests alone, whose run they count, so no other test's stop or
// vehicle can spend a call they don't expect, however the tests are ordered. A fourth serves the
// crowded recording, where more trains stand at one stop than its panel lists before "Show all",
// a fifth the simulation, chosen by name, and a sixth the timetable source with SIRI-ET's delays
// from their recording. All but the first have the aircraft off, so no test calls adsb.lol.

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
      // Unset, not empty, whatever the shell running the tests sets: the default as production
      // would meet it, on the deployed timetable.
      command: `env -u MYLDER_SOURCE -u MYLDER_TIMETABLE_FROM npm start -- --port ${DEFAULT_PORT}`,
      port: DEFAULT_PORT,
      env: { MYLDER_AIRCRAFT_SOURCE: 'off' },
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
    {
      command: `npm start -- --port ${SIMULATED_PORT}`,
      port: SIMULATED_PORT,
      env: { MYLDER_SOURCE: 'simulated', MYLDER_AIRCRAFT_SOURCE: 'off' },
      reuseExistingServer: !process.env.CI,
    },
    {
      // The timetable source, unset as production meets it, with updates from the recording, which
      // brings its own timetable and clock.
      command: `env -u MYLDER_SOURCE -u MYLDER_TIMETABLE_FROM npm start -- --port ${UPDATES_PORT}`,
      port: UPDATES_PORT,
      env: { MYLDER_UPDATES: `recording:${UPDATES}`, MYLDER_AIRCRAFT_SOURCE: 'off' },
      reuseExistingServer: !process.env.CI,
    },
  ],
})
