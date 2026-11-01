import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  const banner = page.locator('[role=status]:not([role=dialog] [role=status])')
  await expect(banner).toContainText("Timetable only: live positions aren't connected yet")
  const vw = page.viewportSize()!.width
  const b = (await banner.boundingBox())!
  console.log('viewport', vw, 'banner', JSON.stringify(b))
  expect(b.x).toBeGreaterThanOrEqual(0)
  expect(b.x + b.width).toBeLessThanOrEqual(vw)
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(scroll).toBe(0)
  await step('phone banner wraps')
}
