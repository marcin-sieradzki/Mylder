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

test('a mode filter takes its vehicles off the map, and its chip keeps the count', async ({
  page,
}) => {
  let buses: number | undefined
  page.on('response', async (response) => {
    if (new URL(response.url()).pathname !== '/api/snapshot' || !response.ok()) return
    const snapshot = (await response.json()) as { trips: { mode: string; cancelled?: true }[] }
    buses = snapshot.trips.filter((trip) => !trip.cancelled && trip.mode === 'bus').length
  })
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  const drawn = async () => Number(await map.getAttribute('data-vehicles'))
  const bus = page.getByRole('group', { name: 'Modes' }).getByRole('button', { name: /^Bus/ })
  await expect(bus).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => buses).toBeGreaterThan(0)
  await expect.poll(drawn).toBeGreaterThan(buses!)
  const all = await drawn()
  const label = await bus.textContent()

  await bus.click()
  await expect(bus).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(drawn).toBe(all - buses!)
  await expect(bus).toHaveText(label!)
  await expect(page).toHaveURL('/en?hide=bus')
})

test('switching language keeps the map where it was, its filters and the rest of the query', async ({
  page,
}) => {
  await page.goto('/en?map=13.00/55.67600/12.56800&hide=bus&line=5C')
  await expect(page.locator('[data-vehicles]')).toBeAttached()
  await page
    .getByRole('navigation', { name: 'Language' })
    .getByRole('link', { name: 'Dansk' })
    .click()
  await expect(page).toHaveURL('/da?map=13.00/55.67600/12.56800&hide=bus&line=5C')
  const bus = page
    .getByRole('group', { name: 'Transportformer' })
    .getByRole('button', { name: /^Bus/ })
  await expect(bus).toHaveAttribute('aria-pressed', 'false')

  // The Danish map opened where the English one was: one step in from there keeps the centre.
  await page.getByRole('region', { name: 'Livekort over København' }).focus()
  await page.keyboard.press('Equal')
  await expect(page).toHaveURL('/da?map=14.00/55.67600/12.56800&hide=bus&line=5C')

  // The switch carries the view the map has now.
  await page
    .getByRole('navigation', { name: 'Sprog' })
    .getByRole('link', { name: 'English' })
    .click()
  await expect(page).toHaveURL('/en?map=14.00/55.67600/12.56800&hide=bus&line=5C')
})

test("a phone gets the phone's top bar from the first paint, before any script runs", async ({
  browser,
}) => {
  // The prerendered page, as a phone paints it before the scripts load: the width alone picks
  // the bar, and the other one is hidden from assistive technology too.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await page.goto('/en')
  const banner = page.getByRole('banner')
  await expect(banner.locator('.pn-TopBar[data-size="small"]')).toBeVisible()
  await expect(banner.locator('.pn-TopBar[data-size="medium"]')).toBeHidden()
  await expect(banner.getByRole('link', { name: 'Mylder' })).toHaveCount(1)
  await context.close()
})

test('the top bar keeps its layout once the page has started, one bar for the width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/en')
  const bars = page.getByRole('banner').locator('.pn-TopBar')
  await expect(page.locator('[data-vehicles]')).toBeAttached()
  await expect(bars).toHaveCount(1)
  await expect(bars).toHaveAttribute('data-size', 'small')
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(bars).toHaveAttribute('data-size', 'medium')
})
