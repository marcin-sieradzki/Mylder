import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// moving-map: map-timetable on a phone: the banner wraps inside the viewport, no sideways scroll.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect.poll(async () => Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles'))).toBeGreaterThan(0)
  const banner = page.getByText(/^Timetable only: live positions aren't connected yet/)
  await expect(banner).toBeVisible()
  await step('phone banner')
  const vw = page.viewportSize()!.width
  const box = (await banner.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vw)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw)
  await expect(page.getByText(/paused|hasn.t answered/i)).toHaveCount(0)
}
