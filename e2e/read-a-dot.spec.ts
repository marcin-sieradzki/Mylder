import type { Page } from '@playwright/test'
import { expect, RECORDING_START, savedSnapshots, test } from './recording'

// Reading the map: a dot's card, the legend, the controls and the credit, on the weekday
// recording's first minute, served at the moment it was fetched so every dot is where the
// snapshot put it.

interface Trip {
  key: string
  position: [number, number]
}
const first = savedSnapshots()[0] as { fetched: number; trips: Trip[] }
/** A bus on line 991 to Teglholmen, with no other dot within 100 px at the opening view. */
const BUS_991 = first.trips.find((trip) => trip.key === 'bus.991.7ce514fd98.20260616.0700')!

/** Serves the first minute's snapshot whenever the page polls, dated when it was fetched. */
async function serveFirstMinute(page: Page) {
  expect(first.fetched).toBe(RECORDING_START)
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      json: first,
      headers: { date: new Date(first.fetched).toUTCString(), 'cache-control': 'no-store' },
    }),
  )
}

/** Where a point is drawn at the map's opening view on a desktop: zoom 11.2 on the centre. */
function onScreen([lat, lon]: [number, number], width: number, height: number) {
  const world = 512 * 2 ** 11.2
  const x = (longitude: number) => ((longitude + 180) / 360) * world
  const y = (latitude: number) =>
    ((1 - Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)) / Math.PI) / 2) * world
  return { x: x(lon) - x(12.565) + width / 2, y: y(lat) - y(55.68) + height / 2 }
}

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
