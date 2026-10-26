import { defineConfig, devices } from '@playwright/test'

// The GitHub Pages demo (ADR 0013), served from out/ as Pages serves it; build it first with
// `npm run demo`. Its tracker runs in the page's Web Worker at the real time, on the deployed
// timetable, so these tests prove the wiring, not the numbers.

const PORT = 4175

export default defineConfig({
  testDir: './e2e/demo',
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
  webServer: {
    command: 'npm run demo:serve',
    port: PORT,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
})
