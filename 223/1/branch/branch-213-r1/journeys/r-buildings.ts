import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  const dots = page.locator('[data-vehicles]')
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/en?map=16.00/55.68100/12.57000/-20.0/60.0')
    await expect(dots).toHaveAttribute('data-tilt', '60')
    await page.waitForTimeout(5000)
    await step(`buildings ${scheme}`)
  }
}
