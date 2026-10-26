import { expect, onScreen, savedSnapshots, serveFirstMinute, test } from './recording'

// Opening a vehicle: a tap on its dot opens its detail, which the address keeps through a reload,
// and Esc closes it. The page sees the recording's first minute; the trip route answers from the
// server's own snapshot on the recording.

interface Trip {
  key: string
  position: [number, number]
}
const first = savedSnapshots()[0] as { trips: Trip[] }
/** A bus on line 991 to Teglholmen, with no other dot within 100 px at the opening view. */
const BUS_991 = first.trips.find((trip) => trip.key === 'bus.991.7ce514fd98.20260616.0700')!

test("a tap on a dot opens its vehicle's detail, which the address keeps", async ({ page }) => {
  await serveFirstMinute(page)
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '17')
  const { width, height } = page.viewportSize()!
  const dot = onScreen(BUS_991.position, width, height)
  const panel = page.getByRole('dialog', { name: /to Teglholmen/ })
  // The dot moves on between frames, and a busy machine may draw it late; tap until it opens.
  await expect(async () => {
    await page.mouse.click(dot.x + 8, dot.y - 8)
    await expect(panel).toBeVisible({ timeout: 1_000 })
  }).toPass()
  await expect(page).toHaveURL(new RegExp(`[?&]trip=${BUS_991.key.replaceAll('.', '\\.')}(&|$)`))
  await expect(panel).toContainText('Bus')
  await expect(panel).toContainText('Estimated')
  await expect(panel.getByRole('list', { name: 'Stops' })).toBeVisible()
  await expect(panel).toContainText('Timetable · updated')

  await page.reload()
  await expect(panel.getByRole('list', { name: 'Stops' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page).not.toHaveURL(/trip=/)
})

test('an unknown trip in the address opens as not found', async ({ page }) => {
  await page.goto('/en?trip=nothing')
  await expect(page.getByRole('dialog', { name: 'Trip not found' })).toBeVisible()
})
