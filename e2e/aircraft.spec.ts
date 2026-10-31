import { expect, savedAircraft, serveAircraft, SIMULATED_URL, test } from './recording'

// The aircraft on the weekday recording's aircraft folder, which the server replays one answer
// per call (playwright.config.ts).

interface Served {
  readonly aircraft: readonly { readonly hex: string }[]
}

interface Placed {
  readonly hex: string
  readonly lat: number
  readonly lon: number
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
  // Every answer of the evening recorded holds at least seven planes in the box.
  expect(served!.aircraft.length).toBeGreaterThanOrEqual(7)
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

test('a tap on a plane opens its card in a panel, named by its hex when it sends no callsign', async ({
  page,
}) => {
  // The thirteenth answer, whenever the page polls: 45ab23, a 737 on the ground at Kastrup with
  // no callsign and its own position 4.1 s old, standing at the middle of the map.
  await serveAircraft(page, 12)
  const { lat, lon } = (savedAircraft()[12] as { aircraft: Placed[] }).aircraft.find(
    (each) => each.hex === '45ab23',
  )!
  await page.goto(`/en?map=15.00/${lat}/${lon}`)
  await expect
    .poll(async () => Number(await page.locator('[data-aircraft]').getAttribute('data-aircraft')))
    .toBeGreaterThan(0)
  const { width, height } = page.viewportSize()!
  const panel = page.getByRole('dialog', { name: '45ab23' })
  // A busy machine may draw the plane late; tap until it opens.
  await expect(async () => {
    await page.mouse.click(width / 2 + 4, height / 2 - 4)
    await expect(panel).toBeVisible({ timeout: 1_000 })
  }).toPass()
  await expect(page).toHaveURL(/[?&]aircraft=45ab23(&|$)/)
  await expect(panel).toContainText('B738 · On the ground · 21 km/h')
  await expect(panel).toContainText(/Reported \d+ s ago/)

  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page).not.toHaveURL(/aircraft=/)
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
