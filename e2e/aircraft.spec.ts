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

test('the Planes filter takes every plane off the map and stops asking for them until it is on', async ({
  page,
}) => {
  let asked = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/aircraft') asked++
  })
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  const drawn = async () => Number(await map.getAttribute('data-aircraft'))
  const planes = page
    .getByRole('group', { name: 'Filters' })
    .getByRole('button', { name: /^Planes/ })
  await expect(planes).toHaveAttribute('aria-pressed', 'true')
  await expect(planes).toHaveText(/^Planes \d+$/)
  await expect.poll(drawn).toBeGreaterThan(0)

  await planes.click()
  await expect(planes).toHaveAttribute('aria-pressed', 'false')
  await expect(map).not.toHaveAttribute('data-aircraft')
  await expect(page).toHaveURL('/en?hide=aircraft')
  const before = asked
  // A minute on, past every poll that would have fallen due meanwhile.
  await page.clock.fastForward(60_000)
  expect(asked).toBe(before)

  const polled = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/aircraft',
  )
  await planes.click()
  await polled
  await expect(planes).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(drawn).toBeGreaterThan(0)
  await expect(page).toHaveURL('/en')
})

test('with the aircraft off, the route answers 404 and the map draws none', async ({ page }) => {
  const asked = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/aircraft',
  )
  await page.goto(`${SIMULATED_URL}/en`)
  expect((await asked).status()).toBe(404)
  await expect(page.locator('[data-vehicles]')).toBeAttached()
  await expect(page.locator('[data-aircraft]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Planes/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '© adsb.lol contributors' })).toHaveCount(0)
})
