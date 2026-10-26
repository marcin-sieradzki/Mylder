import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test as base, expect, type Page } from '@playwright/test'

// The production build serves the weekday recording (playwright.config.ts); every page's clock
// starts at the recording's moment, as the server's does.

export const RECORDING = 'weekday'

export const RECORDING_DIR = join('recordings', RECORDING)

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

/** The moment the recording starts, from its `clock.json`. */
export const RECORDING_START = Date.parse(
  (readJson(join(RECORDING_DIR, 'clock.json')) as { start: string }).start,
)

/** The frozen snapshots, one a minute, in order. */
export const savedSnapshots = (): unknown[] => {
  const dir = join(RECORDING_DIR, 'snapshots')
  return readdirSync(dir)
    .sort()
    .map((name) => readJson(join(dir, name)))
}

/** The aircraft source's snapshot of each call in the recording's `aircraft/` folder, in order. */
export const savedAircraft = (): unknown[] => {
  const dir = join(RECORDING_DIR, 'answers', 'aircraft')
  return readdirSync(dir)
    .sort()
    .map((name) => readJson(join(dir, name)))
}

/** The server on the recording, and a second one on the same build on the simulation. */
export const PORT = 4173
export const SIMULATED_PORT = 4174
export const SIMULATED_URL = `http://localhost:${SIMULATED_PORT}`

export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.clock.install({ time: RECORDING_START })
    await provide(page)
  },
})

export { expect }

/** Serves the first minute's snapshot whenever the page polls, dated when it was fetched. */
export async function serveFirstMinute(page: Page) {
  const first = savedSnapshots()[0] as { fetched: number }
  expect(first.fetched).toBe(RECORDING_START)
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      json: first,
      headers: { date: new Date(first.fetched).toUTCString(), 'cache-control': 'no-store' },
    }),
  )
}

/** Where a point is drawn at the map's opening view on a desktop: zoom 11.2 on the centre. */
export function onScreen([lat, lon]: readonly [number, number], width: number, height: number) {
  const world = 512 * 2 ** 11.2
  const x = (longitude: number) => ((longitude + 180) / 360) * world
  const y = (latitude: number) =>
    ((1 - Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)) / Math.PI) / 2) * world
  return { x: x(lon) - x(12.565) + width / 2, y: y(lat) - y(55.68) + height / 2 }
}
