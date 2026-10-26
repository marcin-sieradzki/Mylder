import { expect, onScreen, savedSnapshots, serveFirstMinute, test } from './recording'
import type { Page } from '@playwright/test'

// Following a vehicle: tap a Metro train's dot, press Follow, and the camera keeps the train
// under the map's centre as it runs on, through a zoom; a pan ends it. Show whole line raises the
// highlight chip, which clears it. The page sees the recording's first minute.

interface Trip {
  key: string
  position: [number, number]
}
const first = savedSnapshots()[0] as { trips: Trip[] }
/** An M1 train at Nørreport, near the map's centre, with no other dot within 100 px. */
const M1 = first.trips.find((trip) => trip.key === 'metro.M1.c6fa766489.20260616.0705')!

/** Opens the M1 train's detail with a tap on its dot. */
async function openTheTrain(page: Page) {
  await serveFirstMinute(page)
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '17')
  const { width, height } = page.viewportSize()!
  const dot = onScreen(M1.position, width, height)
  const panel = page.getByRole('dialog', { name: /to Vanløse St\./ })
  await expect(async () => {
    await page.mouse.click(dot.x + 4, dot.y - 4)
    await expect(panel).toBeVisible({ timeout: 1_000 })
  }).toPass()
  return panel
}

/** The card of the dot under the map's centre, after the pointer comes to rest there. */
async function cardAtCentre(page: Page, nudge: number) {
  const { width, height } = page.viewportSize()!
  await page.mouse.move(width / 2 + nudge, height / 2)
  return page.getByRole('tooltip')
}

test('Follow keeps a Metro train under the centre until the viewer pans', async ({ page }) => {
  // It watches the train for seconds of the page's own clock, while the map draws every frame.
  test.slow()
  const panel = await openTheTrain(page)
  const follow = panel.getByRole('button', { name: 'Follow' })
  await follow.click()
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  // Closer in, the train runs off a fixed point within a few seconds: 12 m/s is 5 px a second.
  const zoomIn = page.getByRole('button', { name: 'Zoom in' })
  for (let i = 0; i < 3; i++) await zoomIn.click()
  await expect(follow).toHaveAttribute('aria-pressed', 'true')

  for (const [i, wait] of [0, 4_000, 4_000].entries()) {
    await page.waitForTimeout(wait)
    const card = await cardAtCentre(page, i % 2 === 0 ? 1 : -1)
    await expect(card).toContainText('M1 to Vanløse St.')
  }

  // A drag across the map is a pan: Follow ends, and the address keeps where the map was left,
  // which stays put while the train runs on.
  const { width, height } = page.viewportSize()!
  await page.mouse.move(width / 2 - 100, height / 2 + 150)
  await page.mouse.down()
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(width / 2 - 100 + step * 20, height / 2 + 150)
    await page.waitForTimeout(30)
  }
  await page.mouse.up()
  await expect(follow).toHaveAttribute('aria-pressed', 'false')
  await expect(page).toHaveURL(/[?&]map=/)
  const left = new URL(page.url()).searchParams.get('map')
  await page.waitForTimeout(3_000)
  expect(new URL(page.url()).searchParams.get('map')).toBe(left)
  const card = await cardAtCentre(page, 1)
  await expect(card).toBeHidden()
})

test("Show whole line raises the chip, and the chip clears the train's line", async ({ page }) => {
  const panel = await openTheTrain(page)
  await panel.getByRole('button', { name: 'Show whole line' }).click()
  const chip = page.getByRole('button', { name: 'Showing: line M1 · Clear' })
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  // The highlight stays when the panel closes, and Esc then clears it.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(chip).toBeHidden()
})
