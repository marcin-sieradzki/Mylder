import { expect, savedAircraft, SIMULATED_URL, test } from './recording'

// The aircraft on the weekday recording's aircraft folder, which the server replays one answer
// per call (playwright.config.ts).

interface Served {
  readonly aircraft: readonly { readonly hex: string }[]
}

test('the map draws as many aircraft as the recording’s aircraft snapshot', async ({ page }) => {
  let served: Served | undefined
  page.on('response', async (response) => {
    if (new URL(response.url()).pathname !== '/api/aircraft' || !response.ok()) return
    served = (await response.json()) as Served
  })
  await page.goto('/en')
  const map = page.locator('[data-aircraft]')
  await expect(map).toBeAttached()
  await expect
    .poll(async () => [Number(await map.getAttribute('data-aircraft')), served?.aircraft.length])
    .toEqual([served?.aircraft.length, served?.aircraft.length])
  // What was served is one of the recording's answers as the aircraft source keeps it.
  const saved = (savedAircraft() as Served[]).map((snapshot) => snapshot.aircraft)
  expect(saved).toContainEqual(served!.aircraft)
  expect(served!.aircraft.length).toBeGreaterThanOrEqual(20)
})

test('with the aircraft off, the route answers 404 and the map draws none', async ({ page }) => {
  const asked = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/aircraft',
  )
  await page.goto(`${SIMULATED_URL}/en`)
  expect((await asked).status()).toBe(404)
  await expect(page.locator('[data-vehicles]')).toBeAttached()
  await expect(page.locator('[data-aircraft]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '© adsb.lol contributors' })).toHaveCount(0)
})
