import type { Page } from '@playwright/test'
import { expect, test } from './recording'

// The 3D view's camera on the weekday recording: the keys, a right-drag and the 3D toggle tilt and
// turn the map, the scale bar hides while it is tilted, every vehicle is still drawn, the compass
// turns it back to north, and reset brings it back flat. The scale bar is found by the distance it
// shows; the camera's tilt and heading at rest are on the map's container, beside the vehicles it
// draws.

/** The scale bar, by the distance it shows, such as "2 km". */
const scaleBar = (page: Page) => page.getByText(/\d+\s(m|km)$/)

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
  const scale = scaleBar(page)
  await expect(scale).toBeVisible()

  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(scale).toBeHidden()
  await expect.poll(drawsAll).toBe(true)

  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(scale).toBeVisible()
})

test('a sideways right-drag turns the map, an upward one tilts it, and Shift + ↓ brings it back flat', async ({
  page,
}) => {
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  await expect(map).toBeAttached()
  await expect(map).toHaveAttribute('data-heading', '0')
  await expect(map).toHaveAttribute('data-tilt', '0')
  const scale = scaleBar(page)
  await expect(scale).toBeVisible()
  const canvas = page.getByRole('region', { name: 'Live map of Copenhagen' })
  const box = (await canvas.boundingBox())!
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  /** Drags with the right button from the canvas's middle by `dx` and `dy` px. */
  const rightDrag = async (dx: number, dy: number) => {
    await page.mouse.move(x, y)
    await page.mouse.down({ button: 'right' })
    await page.mouse.move(x + dx, y + dy, { steps: 10 })
    await page.mouse.up({ button: 'right' })
  }

  // Sideways, it turns the map and leaves it flat, so the scale bar stays.
  await rightDrag(150, 0)
  await expect(map).not.toHaveAttribute('data-heading', '0')
  await expect(map).toHaveAttribute('data-tilt', '0')
  await expect(scale).toBeVisible()
  const heading = await map.getAttribute('data-heading')

  // Upward, it tilts the map, keeping the heading, and the scale bar hides.
  await rightDrag(0, -60)
  await expect(map).not.toHaveAttribute('data-tilt', '0')
  await expect(map).toHaveAttribute('data-heading', heading!)
  await expect(scale).toBeHidden()

  await canvas.focus()
  // Each press tilts back by 10° at most; a few more than the drag tilted it brings it flat.
  await expect(async () => {
    await page.keyboard.press('Shift+ArrowDown')
    await expect(scale).toBeVisible({ timeout: 500 })
  }).toPass()
  await expect(map).toHaveAttribute('data-tilt', '0')
})

test('the 3D toggle tilts the map, the compass turns it back to north, and reset lays it flat', async ({
  page,
}) => {
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  await expect(map).toBeAttached()
  const scale = scaleBar(page)
  await expect(scale).toBeVisible()
  const toggle = page.getByRole('button', { name: '3D view' })
  const compass = page.getByRole('button', { name: 'Reset to north' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(scale).toBeHidden()
  await expect(map).toHaveAttribute('data-tilt', '50')

  // Turned away from north, the compass says so, and a press turns the map back, still tilted.
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(map).toHaveAttribute('data-heading', '15')
  await expect(compass).toHaveAccessibleDescription('Map turned away from north')
  await compass.click()
  await expect(map).toHaveAttribute('data-heading', '0')
  await expect(compass).not.toHaveAccessibleDescription('Map turned away from north')
  await expect(map).toHaveAttribute('data-tilt', '50')

  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(map).toHaveAttribute('data-tilt', '0')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(scale).toBeVisible()
})
