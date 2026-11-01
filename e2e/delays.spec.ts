import { expect, test, type APIRequestContext } from '@playwright/test'
import { savedUpdatesSnapshot, UPDATES_URL } from './recording'

// SIRI-ET's delays on the map (spec #146): a server on the timetable source with updates from the
// SIRI-ET recording, which runs the reader inside the tracker over its messages from 09:00 on
// Saturday 31 October 2026, on its own timetable. The server's clock runs on from its first
// request, so the page reads it from the server's answers, as it always does.

interface Trip {
  readonly key: string
  readonly mode: string
  readonly headsign: string
  readonly next: readonly { readonly stop: string }[]
  readonly state: string
  readonly position: [number, number]
  readonly delay?: number
  readonly updated?: number
  readonly cancelled?: true
}

interface SnapshotLike {
  readonly fetched: number
  readonly source: unknown
  readonly updates: { readonly kind: string; readonly fresh: boolean }
  readonly trips: readonly Trip[]
}

const snapshotNow = async (request: APIRequestContext) =>
  (await (await request.get(`${UPDATES_URL}/api/snapshot`)).json()) as SnapshotLike

test('with updates from the SIRI-ET recording, the server draws trips Estimated on their delay', async ({
  request,
}) => {
  const snapshot = await snapshotNow(request)
  expect(snapshot.source).toEqual({ kind: 'timetable' })
  expect(snapshot.updates).toMatchObject({ kind: 'recording', fresh: true })
  const estimated = snapshot.trips.filter((trip) => trip.state === 'estimated')
  expect(estimated.length).toBeGreaterThan(0)
  for (const trip of estimated) expect(trip.updated).toBeDefined()
  // SIRI-ET has no Metro: every Metro trip stays Timetable only.
  const metro = snapshot.trips.filter((trip) => trip.mode === 'metro')
  expect(metro.length).toBeGreaterThan(0)
  for (const trip of metro) expect(trip.state).toBe('timetable-only')
  expect(snapshot.trips.some((trip) => ['live', 'ageing'].includes(trip.state))).toBe(false)
})

test('the page draws the Estimated dots and says what they are', async ({ page, request }) => {
  await page.goto(`${UPDATES_URL}/en`)
  const banner = page.getByRole('status').filter({ hasText: /^Timetable and delays:/ })
  await expect(banner).toHaveText(
    "Timetable and delays: live positions aren't connected yet, so each vehicle is placed from its timetable and, where Rejseplanen has sent one, its delay.",
  )
  await expect(
    page.getByText(
      "For now a vehicle is Estimated, placed from its delay, or Timetable only: live positions aren't connected yet.",
    ),
  ).toBeVisible()
  // Every trip of the snapshot is drawn but the cancelled ones; the next minute's may land.
  const map = page.locator('[data-vehicles]')
  await expect(async () => {
    const drawn = Number(await map.getAttribute('data-vehicles'))
    const { trips } = await snapshotNow(request)
    expect(drawn).toBe(trips.filter((trip) => !trip.cancelled).length)
  }).toPass()
})

test('a delayed bus’s card says Estimated', async ({ page }) => {
  // The saved minute of 09:22, served at its moment, so every dot is where it put them.
  const saved = savedUpdatesSnapshot('0002.json') as SnapshotLike
  await page.clock.install({ time: saved.fetched })
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      json: saved,
      headers: { date: new Date(saved.fetched).toUTCString(), 'cache-control': 'no-store' },
    }),
  )
  const bus = saved.trips.find(
    (trip) => trip.mode === 'bus' && trip.state === 'estimated' && (trip.delay ?? 0) >= 120,
  )!
  const [lat, lon] = bus.position
  await page.goto(`${UPDATES_URL}/en?map=16.00/${lat.toFixed(5)}/${lon.toFixed(5)}`)
  await page.getByRole('button', { name: 'Pause' }).click()
  const { width, height } = page.viewportSize()!
  const card = page.getByRole('tooltip')
  await expect(async () => {
    await page.mouse.move(width / 2 + 40, height / 2 + 40)
    await page.mouse.move(width / 2, height / 2)
    await expect(card).toContainText('Estimated', { timeout: 1000 })
  }).toPass()
})

test('an opened delayed bus and its next stop show its expected times and the delays’ update', async ({
  page,
  request,
}) => {
  const { trips } = await snapshotNow(request)
  const bus = trips.find(
    (trip) =>
      trip.mode === 'bus' &&
      trip.state === 'estimated' &&
      !trip.cancelled &&
      Math.abs(trip.delay ?? 0) >= 120 &&
      trip.next.length > 0,
  )!
  const source = /Timetable and Rejseplanen's delays · updated \d\d:\d\d:\d\d/
  await page.goto(`${UPDATES_URL}/en?trip=${encodeURIComponent(bus.key)}`)
  const vehicle = page.getByRole('dialog', { name: `to ${bus.headsign}` })
  await expect(vehicle).toContainText(source)
  await expect(vehicle.getByRole('list', { name: 'Stops' })).toContainText(/~\d\d:\d\d/)
  await page.goto(`${UPDATES_URL}/en?stop=${bus.next[0].stop}`)
  const stop = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('tab', { name: 'Departures' }) })
  await expect(stop.getByRole('list', { name: 'Departures' })).toContainText(/~\d\d:\d\d/)
  await expect(stop).toContainText(source)
  await expect(stop).toContainText(
    "Countdowns use the timetable, moved by Rejseplanen's delay where a trip has one; the rest use the timetable alone.",
  )
})
