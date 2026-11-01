import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test as base, expect, type Page } from '@playwright/test'
import { E2E_PORTS } from '../scripts/ports.ts'

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

/**
 * Serves the aircraft snapshot of one of the recording's aircraft calls, from 0, whenever the
 * page polls, dated when it was fetched, to the second, as the server dates it.
 */
export async function serveAircraft(page: Page, call: number) {
  const snapshot = savedAircraft()[call] as { fetched: number }
  await page.route('**/api/aircraft', (route) =>
    route.fulfill({
      json: snapshot,
      headers: { date: new Date(snapshot.fetched).toUTCString(), 'cache-control': 'no-store' },
    }),
  )
}

/** The server on the recording, and a second one on the same build with `MYLDER_SOURCE` unset. */
export const PORT = E2E_PORTS.recording
export const DEFAULT_PORT = E2E_PORTS.default
export const DEFAULT_URL = `http://localhost:${DEFAULT_PORT}`

/**
 * A third server on the same build and recording, which only the snapshot route's tests ask, so
 * its runs, and the calls it counts, are theirs alone, whatever the other tests open and when.
 */
export const SNAPSHOT_PORT = E2E_PORTS.snapshot
export const SNAPSHOT_URL = `http://localhost:${SNAPSHOT_PORT}`

/**
 * A fourth server on the same build, on the crowded recording, where six trains stand at
 * København H from 07:20 to 07:24 (recordings/crowded): more than its standing list shows before
 * "Show all". It starts at the weekday recording's moment, by its server's clock from its first
 * request, so only the test that asks it, once, may ask it.
 */
export const CROWDED = 'crowded'
export const CROWDED_PORT = E2E_PORTS.crowded
export const CROWDED_URL = `http://localhost:${CROWDED_PORT}`
export const CROWDED_START = Date.parse(
  (readJson(join('recordings', CROWDED, 'clock.json')) as { start: string }).start,
)

/** A fifth server on the same build, on the simulation, which a test must choose by name. */
export const SIMULATED_PORT = E2E_PORTS.simulated
export const SIMULATED_URL = `http://localhost:${SIMULATED_PORT}`

/**
 * A sixth server on the same build, on the timetable source with SIRI-ET's updates from their
 * recording (`MYLDER_UPDATES=recording:siri-et`), on its timetable from its clock, 09:00 on
 * Saturday 31 October 2026. Its snapshots of 09:21 and 09:22 are saved beside its messages.
 */
export const UPDATES = 'siri-et'
export const UPDATES_PORT = E2E_PORTS.updates
export const UPDATES_URL = `http://localhost:${UPDATES_PORT}`

/** One of the SIRI-ET recording's saved snapshots, by its file's name. */
export const savedUpdatesSnapshot = (name: string): unknown =>
  readJson(join('recordings', UPDATES, 'snapshots', name))

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

/**
 * Serves a stop's answer as the stop route gave it at the recording's second minute, saved with
 * the recording, whenever the page asks for it, so its standing trips are the same whenever the
 * test runs, whatever time the server's clock has reached by then.
 */
export async function serveSavedStop(page: Page, stopId: string) {
  const answer = readJson(join(RECORDING_DIR, 'answers', 'stops', `${stopId}.json`))
  await page.route(`**/api/stops/${stopId}`, (route) =>
    route.fulfill({ json: answer, headers: { 'cache-control': 'no-store' } }),
  )
}

/**
 * Serves a stop's arrivals as the arrivals route gave them at the recording's second minute, saved
 * with the recording beside its departures, whenever the page asks for them, so its rows are the
 * same whenever the test runs.
 */
export async function serveSavedArrivals(page: Page, stopId: string) {
  const answer = readJson(join(RECORDING_DIR, 'answers', 'arrivals', `${stopId}.json`))
  await page.route(`**/api/stops/${stopId}/arrivals`, (route) =>
    route.fulfill({ json: answer, headers: { 'cache-control': 'no-store' } }),
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
