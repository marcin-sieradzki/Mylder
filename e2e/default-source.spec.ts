import { expect, test } from '@playwright/test'
import { DEFAULT_URL } from './recording'

// The default source: a server with MYLDER_SOURCE unset, as `npm run dev` with nothing set or a
// deployment that forgets the variable, runs on the deployed timetable at the real time, so the
// page keeps the real clock here, not the recording's.

interface SnapshotLike {
  readonly source: unknown
  readonly positionMode: string
  readonly status: { readonly calls: readonly unknown[] }
  readonly trips: readonly { readonly state: string }[]
}

test('with MYLDER_SOURCE unset, the map runs on the timetable and says so', async ({
  page,
  request,
}) => {
  const response = await request.get(`${DEFAULT_URL}/api/snapshot`)
  expect(response.status()).toBe(200)
  const snapshot = (await response.json()) as SnapshotLike
  expect(snapshot.source).toEqual({ kind: 'timetable' })
  expect(snapshot.positionMode).toBe('none')
  expect(snapshot.status.calls).toEqual([])
  expect(snapshot.trips.length).toBeGreaterThan(0)
  expect(new Set(snapshot.trips.map((trip) => trip.state))).toEqual(new Set(['timetable-only']))

  await page.goto(`${DEFAULT_URL}/en`)
  // The City sheet has statuses of its own; the banner is the one that names the data.
  const banner = page.getByRole('status').filter({ hasText: /^Timetable only:/ })
  await expect(banner).toHaveText(
    "Timetable only: live positions aren't connected yet, so every vehicle is placed where its timetable says it should be.",
  )
  const map = page.locator('[data-vehicles]')
  await expect
    .poll(async () => Number(await map.getAttribute('data-vehicles')), {
      message: 'vehicles drawn',
    })
    .toBeGreaterThan(0)
})
