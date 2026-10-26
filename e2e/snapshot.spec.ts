import { expect, test } from '@playwright/test'
import { RECORDING, savedSnapshots, SIMULATED_URL } from './recording'

interface SnapshotLike {
  readonly source: unknown
  readonly fetched: number
  readonly nextDue: number
  readonly positionMode: string
  readonly budget: { readonly calls: number }
  readonly trips: readonly { readonly key: string }[]
}

const keys = (snapshot: SnapshotLike) => snapshot.trips.map((trip) => trip.key)

// In order, on one server: a request that comes while another holds the first run gets the
// timetable alone, so the first request must make the run these tests read.
test.describe.configure({ mode: 'default' })

test('the snapshot route serves the recording, cached until the next one is due', async ({
  request,
}) => {
  const response = await request.get('/api/snapshot')
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toMatch('public, max-age=0, must-revalidate')
  const snapshot = (await response.json()) as SnapshotLike
  expect(snapshot.source).toEqual({ kind: 'recording', name: RECORDING })
  expect(snapshot.positionMode).toBe('alternating')
  // Each run replays the next minute's answer, and the server's clock started at the
  // recording's moment, so the snapshot is the frozen one for as many runs as it has made: one
  // call each, and the first run's disruption list.
  const saved = savedSnapshots() as SnapshotLike[]
  const frozen = saved[Math.min(snapshot.budget.calls - 1, saved.length) - 1]
  expect(snapshot.fetched - frozen.fetched).toBeLessThan(60_000)
  expect(keys(snapshot)).toEqual(keys(frozen))
  expect(snapshot.nextDue).toBeGreaterThan(snapshot.fetched)
  // The date header is the tracker's clock, the recording's, which the browser keeps.
  const date = Date.parse(response.headers()['date'])
  expect(date - snapshot.fetched).toBeGreaterThanOrEqual(-1000)
  expect(date - snapshot.fetched).toBeLessThan(60_000)
})

test('the disruption route serves the recorded messages, cached for the CDN', async ({
  request,
}) => {
  const response = await request.get('/api/disruptions')
  expect(response.status()).toBe(200)
  expect(response.headers()['vercel-cdn-cache-control']).toMatch(/max-age=\d+/)
  const list = (await response.json()) as {
    ok: boolean
    messages: { fieldsKind: string; message: { head: string } }[]
  }
  expect(list.ok).toBe(true)
  expect(list.messages.length).toBeGreaterThan(0)
})

test('the stop and trip routes answer 404 for an id they don’t know', async ({ request }) => {
  expect((await request.get('/api/stops/0')).status()).toBe(404)
  expect((await request.get('/api/trips/bus.5C.none.20260616.0700')).status()).toBe(404)
})

test('the default source, the simulation, starts', async ({ request }) => {
  const response = await request.get(`${SIMULATED_URL}/api/snapshot`)
  expect(response.status()).toBe(200)
  const snapshot = (await response.json()) as SnapshotLike
  expect(snapshot.source).toEqual({ kind: 'simulated', name: 'weekday' })
  expect(Array.isArray(snapshot.trips)).toBe(true)
})
