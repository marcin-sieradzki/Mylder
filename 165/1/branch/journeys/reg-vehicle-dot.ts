import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Regression, vehicle-detail trip-open from a dot, trip-follow, trip-line and its chip.
const KEY = 'metro.M1.c6fa766489.20260616.0705'
export default async ({ page, step, expect }: Journey) => {
  const snapshot = await (await page.request.get('/api/snapshot')).json()
  const trip = snapshot.trips.find((t: { key: string }) => t.key === KEY)
  if (!trip) throw new Error(`precondition: ${KEY} is not in /api/snapshot`)
  const [lat, lon] = trip.position
  await page.goto(`/en?map=14.00/${lat.toFixed(5)}/${lon.toFixed(5)}`)
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-tilt', '0', { timeout: 20_000 })
  await step('map centred on the M1 train')
  const { width, height } = page.viewportSize()!
  const panel = page.getByRole('dialog', { name: /to Vanløse St\./ })
  // The train runs on from its snapshot position: tap points within 40 px of the middle, nearest first.
  const offsets: [number, number][] = [[0, 0]]
  for (const r of [8, 16, 24, 32, 40]) for (let a = 0; a < 8; a++) offsets.push([Math.round(r * Math.cos((a * Math.PI) / 4)), Math.round(r * Math.sin((a * Math.PI) / 4))])
  await expect(async () => {
    for (const [dx, dy] of offsets) {
      await page.mouse.click(width / 2 + dx, height / 2 + dy)
      if (await panel.isVisible()) return
      await page.waitForTimeout(100)
    }
    await expect(panel).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 30_000 })
  await expect(page).toHaveURL(new RegExp(`trip=${KEY.replace(/\./g, '\\.')}`))
  await step('tapped dot opened the panel')
  const follow = panel.getByRole('button', { name: 'Follow' })
  await follow.click()
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  await step('follow on')
  await panel.getByRole('button', { name: 'Show whole line' }).click()
  const chip = page.getByRole('button', { name: /^Showing: line .* · Clear$/ })
  await expect(chip).toBeVisible()
  await page.waitForTimeout(2_000)
  await step('whole line and chip')
  await chip.click()
  await expect(chip).toBeHidden()
  await step('chip cleared')
}
