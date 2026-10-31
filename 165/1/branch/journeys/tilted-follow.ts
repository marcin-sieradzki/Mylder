import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule 1: following a vehicle on a tilted, turned map keeps the tilt and heading while the
// camera stays on the dot.
const KEY = 'metro.M1.c6fa766489.20260616.0705'

export default async ({ page, step, expect }: Journey) => {
  const snapshot = await (await page.request.get('/api/snapshot')).json()
  const trip = snapshot.trips.find((t: { key: string }) => t.key === KEY)
  if (!trip) throw new Error(`precondition: ${KEY} is not in /api/snapshot`)
  const [lat, lon] = trip.position
  await page.goto(`/en?map=14.00/${lat.toFixed(5)}/${lon.toFixed(5)}/-30.0/50.0&trip=${KEY}`)
  const cam = page.locator('[data-vehicles]')
  await expect(cam).toHaveAttribute('data-tilt', '50', { timeout: 20_000 })
  await expect(cam).toHaveAttribute('data-heading', '-30')
  const panel = page.getByRole('dialog', { name: /to Vanløse St\./ })
  await expect(panel).toBeVisible()
  await step('tilted turned map with the M1 panel open')

  const follow = panel.getByRole('button', { name: 'Follow' })
  await follow.click()
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(2_000)
  await step('follow pressed')

  const { width, height } = page.viewportSize()!
  for (const [i, wait] of [0, 4_000, 4_000].entries()) {
    await page.waitForTimeout(wait)
    await expect(async () => {
      await page.mouse.move(width / 2 + (i % 2 === 0 ? 1 : -1), height / 2)
      await page.mouse.move(width / 2 + (i % 2 === 0 ? 2 : -2), height / 2)
      await expect(page.getByRole('tooltip')).toContainText('M1 to Vanløse St.', { timeout: 1_000 })
    }).toPass({ timeout: 10_000 })
    await expect(follow).toHaveAttribute('aria-pressed', 'true')
    await expect(cam).toHaveAttribute('data-tilt', '50')
    await expect(cam).toHaveAttribute('data-heading', '-30')
    await step(`following ${i}: card of M1 at the centre, still tilted and turned`)
  }
  const map = new URL(page.url()).searchParams.get('map')
  console.log('address map=', map)
  if (map) expect(map).toMatch(/\/-30\.0\/50\.0$/)
}
