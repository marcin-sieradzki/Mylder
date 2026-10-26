import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test as base } from '@playwright/test'

// The production build serves the weekday recording (playwright.config.ts); every page's clock
// starts at the recording's moment, as the server's does.

export const RECORDING = 'weekday'

export const RECORDING_DIR = join('recordings', RECORDING)

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

/** The moment the recording starts, from its `clock.json`. */
export const RECORDING_START = Date.parse(
  (readJson(join(RECORDING_DIR, 'clock.json')) as { start: string }).start,
)

/** The snapshot the tracker gave at the recording's first minute, when it was frozen. */
export const firstSnapshot = () => readJson(join(RECORDING_DIR, 'snapshots', '0001.json'))

/** The second server on the same build, on the simulation. */
export const SIMULATED_URL = 'http://localhost:4174'

export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.clock.install({ time: RECORDING_START })
    await provide(page)
  },
})

export { expect } from '@playwright/test'
