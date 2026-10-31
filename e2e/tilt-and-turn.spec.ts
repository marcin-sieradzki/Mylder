import type { Page } from '@playwright/test'
import { expect, test } from './recording'

// The 3D view's camera on the weekday recording: the keys and a right-drag tilt and turn the map,
// the scale bar hides while it is tilted, every vehicle is still drawn, and reset brings it back
// flat. The scale bar is found by the distance it shows; the camera's tilt and heading at rest are
// on the map's container, beside the vehicles it draws.

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

test('a tilted, turned map keeps its angle in the address, a reload opens it there, and reset makes the link flat again', async ({
  page,
}) => {
  await page.goto('/en?map=13.00/55.67600/12.56800')
  const map = page.locator('[data-vehicles]')
  await expect(map).toHaveAttribute('data-tilt', '0')

  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  // Two steps of each, as many as the keys run ahead of the map.
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowUp')
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowRight')
  await expect(map).toHaveAttribute('data-tilt', '20')
  await expect(map).toHaveAttribute('data-heading', '30')
  await expect(page).toHaveURL(/[?&]map=13\.00\/55\.67600\/12\.56800\/30\.0\/20\.0$/)

  await page.reload()
  await expect(map).toHaveAttribute('data-tilt', '20')
  await expect(map).toHaveAttribute('data-heading', '30')
  await expect(scaleBar(page)).toBeHidden()

  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(map).toHaveAttribute('data-tilt', '0')
  await expect(page).toHaveURL(/[?&]map=[\d.]+\/[\d.]+\/[\d.]+$/)
})

for (const [device, viewport] of [
  ['a desktop', { width: 1280, height: 720 }],
  ['a phone', { width: 390, height: 844 }],
] as const) {
  test(`a five-part link opens the map at its tilt and heading with every vehicle drawn, on ${device}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    const served = servedVehicles(page)
    await page.goto('/en?map=14.00/55.67600/12.56800/-30.0/50.0')
    const map = page.locator('[data-vehicles]')
    await expect(map).toHaveAttribute('data-tilt', '50')
    await expect(map).toHaveAttribute('data-heading', '-30')
    await expect(scaleBar(page)).toBeHidden()
    await expect.poll(() => served.count).toBeGreaterThan(0)
    await expect
      .poll(async () => Number(await map.getAttribute('data-vehicles')) === served.count)
      .toBe(true)
  })
}

test('a three-part link opens flat and north-up, and a tilt out of range is dropped while the map still opens', async ({
  page,
}) => {
  await page.goto('/en?map=14.00/55.67600/12.56800')
  const map = page.locator('[data-vehicles]')
  await expect(map).toHaveAttribute('data-tilt', '0')
  await expect(map).toHaveAttribute('data-heading', '0')
  await expect(scaleBar(page)).toBeVisible()
  await expect(page).toHaveURL(/[?&]map=14\.00\/55\.67600\/12\.56800$/)

  await page.goto('/en?map=14.00/55.67600/12.56800/-30.0/75.0')
  await expect(map).toHaveAttribute('data-tilt', '0')
  await expect(map).toHaveAttribute('data-heading', '-30')
  await expect(map).not.toHaveAttribute('data-vehicles', '0')
})
