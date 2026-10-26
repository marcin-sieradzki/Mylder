import { expect, test } from './recording'

// The map on the weekday recording, whose timetable the routes serve.

test('the map draws Copenhagen in a canvas named for it', async ({ page }) => {
  const stops = page.waitForResponse(
    (response) => /\/api\/timetable\/[^/]+\/stops$/.test(response.url()) && response.ok(),
  )
  await page.goto('/en')
  const map = page.getByRole('region', { name: 'Live map of Copenhagen' })
  await expect(map).toBeVisible()
  expect(await map.evaluate((element) => element.tagName)).toBe('CANVAS')
  // The basemap's lines and stops come from the recording's timetable.
  expect((await stops).headers()['cache-control']).toBe('public, max-age=31536000, immutable')
})

test('the canvas has its Danish name at /da', async ({ page }) => {
  await page.goto('/da')
  await expect(page.getByRole('region', { name: 'Livekort over København' })).toBeVisible()
})

test('the map draws as many vehicles as the snapshot it was served', async ({ page }) => {
  // Every vehicle that isn't cancelled is drawn, the latest snapshot's.
  let served: number | undefined
  page.on('response', async (response) => {
    if (new URL(response.url()).pathname !== '/api/snapshot' || !response.ok()) return
    const snapshot = (await response.json()) as { trips: { cancelled?: true }[] }
    served = snapshot.trips.filter((trip) => !trip.cancelled).length
  })
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  await expect(map).toBeAttached()
  await expect
    .poll(async () => [Number(await map.getAttribute('data-vehicles')), served])
    .toEqual([served, served])
  expect(served).toBeGreaterThan(0)
})
