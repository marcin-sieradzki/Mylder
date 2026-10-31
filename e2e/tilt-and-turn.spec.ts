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
  await expect(map).toHaveAttribute('data-tilt', '30')
  await expect(map).toHaveAttribute('data-heading', '15')
  await expect(scale).toBeHidden()
  await expect.poll(drawsAll).toBe(true)

  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(scale).toBeVisible()
})

test('holding Shift + → keeps turning the map, and it stops soon after the key is let go', async ({
  page,
}) => {
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  await expect(map).toHaveAttribute('data-heading', '0')
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  // A held key as the keyboard sends it: trusted keydowns, repeating every 33 ms, sent without
  // waiting for the page, so they pile up while a slow renderer draws a frame.
  const cdp = await page.context().newCDPSession(page)
  const shift = { key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }
  const right = { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }
  const key = (type: 'rawKeyDown' | 'keyUp', which: object, autoRepeat = false) =>
    cdp.send('Input.dispatchKeyEvent', { type, modifiers: 8, autoRepeat, ...which })
  const sent = [key('rawKeyDown', shift), key('rawKeyDown', right)]
  for (const start = Date.now(); Date.now() - start < 3_000;) {
    await page.waitForTimeout(33)
    sent.push(key('rawKeyDown', right, true))
  }
  sent.push(key('keyUp', right), key('keyUp', shift))
  await Promise.all(sent)

  // Well past the two steps a held key used to stop at, and still once it has come to rest.
  const heading = async () => Number(await map.getAttribute('data-heading'))
  await expect.poll(heading).toBeGreaterThanOrEqual(60)
  await page.waitForTimeout(1_000)
  const rested = await heading()
  await page.waitForTimeout(1_000)
  expect(await heading()).toBe(rested)
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

test('a tilted, turned map keeps its angle in the address, a reload opens it there, and reset makes the link flat again', async ({
  page,
}) => {
  await page.goto('/en?map=13.00/55.67600/12.56800')
  const map = page.locator('[data-vehicles]')
  await expect(map).toHaveAttribute('data-tilt', '0')

  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  // Quick presses, each one counted however slowly the map draws.
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowUp')
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight')
  await expect(map).toHaveAttribute('data-tilt', '30')
  await expect(map).toHaveAttribute('data-heading', '45')
  await expect(page).toHaveURL(/[?&]map=13\.00\/55\.67600\/12\.56800\/45\.0\/30\.0$/)

  await page.reload()
  await expect(map).toHaveAttribute('data-tilt', '30')
  await expect(map).toHaveAttribute('data-heading', '45')
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

  // Counted from this page's snapshots on, as many as the latest served.
  const served = servedVehicles(page)
  await page.goto('/en?map=14.00/55.67600/12.56800/-30.0/75.0')
  await expect(map).toHaveAttribute('data-tilt', '0')
  await expect(map).toHaveAttribute('data-heading', '-30')
  await expect.poll(() => served.count).toBeGreaterThan(0)
  await expect
    .poll(async () => Number(await map.getAttribute('data-vehicles')) === served.count)
    .toBe(true)
})
