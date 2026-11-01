import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const banner = page.getByRole('status').filter({ hasText: /^Timetable and delays/ })
  await expect(banner).toBeVisible()
  const box = (await banner.boundingBox())!
  const vw = page.viewportSize()!.width
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vw)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw)
  await step('banner on phone')
}
