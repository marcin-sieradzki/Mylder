import { expect, onScreen, savedSnapshots, serveFirstMinute, test } from './recording'

// Reading the map: a dot's card, the legend, the controls and the credit, on the weekday
// recording's first minute, served at the moment it was fetched so every dot is where the
// snapshot put it.

interface Trip {
  key: string
  position: [number, number]
}
const first = savedSnapshots()[0] as { trips: Trip[] }
/** A bus on line 991 to Teglholmen, with no other dot within 100 px at the opening view. */
const BUS_991 = first.trips.find((trip) => trip.key === 'bus.991.7ce514fd98.20260616.0700')!

test("a tap within 12 px of a dot's centre opens its card", async ({ page }) => {
  await serveFirstMinute(page)
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '17')
  const { width, height } = page.viewportSize()!
  const dot = onScreen(BUS_991.position, width, height)
  await page.mouse.click(dot.x + 8, dot.y - 8)
  const card = page.getByRole('tooltip')
  await expect(card).toContainText('Bus 991 to Teglholmen')
  await expect(card).toContainText('Estimated from schedule')
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
})

test('the legend, the controls and the credit show on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/en')
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  for (const name of [
    'Rejseplanen',
    'CC BY 4.0',
    '© OpenStreetMap contributors',
    '© OpenMapTiles',
    'OpenFreeMap',
  ])
    await expect(page.getByRole('link', { name })).toBeVisible()
  // MapLibre's own credit has given way to the corner credit.
  await expect(page.locator('.maplibregl-ctrl-attrib')).toHaveCount(0)
})

test('the keys zoom the map', async ({ page }) => {
  await page.goto('/en')
  const scale = page.getByText(/\d+\s(m|km)$/)
  await expect(scale).toBeVisible()
  const before = await scale.textContent()
  await page.keyboard.press('+')
  await expect(scale).not.toHaveText(before!)
})
