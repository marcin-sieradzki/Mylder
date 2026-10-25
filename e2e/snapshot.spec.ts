import { expect, test } from '@playwright/test'

test('the snapshot route serves the simulated city, cached until the next one is due', async ({
  request,
}) => {
  const response = await request.get('/api/snapshot')
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toMatch('public, max-age=0, must-revalidate')
  const snapshot = await response.json()
  expect(snapshot.source).toEqual({ kind: 'simulated', name: 'weekday' })
  expect(snapshot.positionMode).toBe('alternating')
  expect(Array.isArray(snapshot.trips)).toBe(true)
  expect(snapshot.nextDue).toBeGreaterThan(snapshot.fetched)
})

test('the stop and trip routes answer 404 for an id they don’t know', async ({ request }) => {
  expect((await request.get('/api/stops/0')).status()).toBe(404)
  expect((await request.get('/api/trips/bus.5C.none.20260616.0700')).status()).toBe(404)
})
