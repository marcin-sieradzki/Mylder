import type { Page } from '@playwright/test'
import { expect, test } from './recording'

// The 3D view's camera on the weekday recording: the keys and a right-drag tilt the map, the
// scale bar hides while it is tilted, every vehicle is still drawn, and reset brings it back flat.

/** Counts the vehicles that aren't cancelled in each snapshot the page is served, the latest kept. */
function servedVehicles(page: Page) {
  const served: { count?: number } = {}
  page.on('response', async (response) => {
    if (new URL(response.url()).pathname !== '/api/snapshot' || !response.ok()) return
    const snapshot = (await response.json()) as { trips: { cancelled?: true }[] }
    served.count = snapshot.trips.filter((trip) => !trip.cancelled).length
  })
  return served
}

test('Shift + ↑ tilts the map, hiding the scale bar with every vehicle still drawn, and reset brings it back', async ({
  page,
}) => {
  const served = servedVehicles(page)
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  // As many as the latest snapshot served, which may land meanwhile.
  const drawsAll = async () => Number(await map.getAttribute('data-vehicles')) === served.count
  await expect.poll(() => served.count).toBeGreaterThan(0)
  await expect.poll(drawsAll).toBe(true)
  const scale = page.locator('.pn-ScaleBar')
  await expect(scale).toBeVisible()

  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(scale).toBeHidden()
  await expect.poll(drawsAll).toBe(true)

  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(scale).toBeVisible()
})

test('a right-drag tilts the map, and Shift + ↓ brings it back flat', async ({ page }) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).toBeAttached()
  const scale = page.locator('.pn-ScaleBar')
  await expect(scale).toBeVisible()
  const canvas = page.getByRole('region', { name: 'Live map of Copenhagen' })
  const box = (await canvas.boundingBox())!
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  // Dragged up with the right button, the map tilts, as MapLibre's own drag does.
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x, y - 60, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await expect(scale).toBeHidden()

  await canvas.focus()
  // Each press tilts back by 10° at most; a few more than the drag tilted it brings it flat.
  await expect(async () => {
    await page.keyboard.press('Shift+ArrowDown')
    await expect(scale).toBeVisible({ timeout: 500 })
  }).toPass()
})
