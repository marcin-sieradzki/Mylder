import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule 1, from afar: on a tilted, turned map centred away from the train, Follow brings the
// camera to the dot and keeps it there, at the rider's tilt and heading, through a zoom.
const KEY = 'metro.M1.c6fa766489.20260616.0705'

export default async ({ page, step, expect }: Journey) => {
  await page.goto(`/en?map=13.00/55.66000/12.60000/-30.0/50.0&trip=${KEY}`)
  const cam = page.locator('[data-vehicles]')
  await expect(cam).toHaveAttribute('data-tilt', '50', { timeout: 20_000 })
  await expect(cam).toHaveAttribute('data-heading', '-30')
  const panel = page.getByRole('dialog', { name: /to Vanløse St\./ })
  await expect(panel).toBeVisible()
  await step('tilted turned map away from the M1 train, panel open')

  const follow = panel.getByRole('button', { name: 'Follow' })
  await follow.click()
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(3_000)
  await step('follow pressed, camera moved to the train')
  const zoomIn = page.getByRole('button', { name: 'Zoom in' })
  await zoomIn.click()
  await page.waitForTimeout(1_500)
  await expect(follow).toHaveAttribute('aria-pressed', 'true')

  const { width, height } = page.viewportSize()!
  for (const [i, wait] of [0, 4_000].entries()) {
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
