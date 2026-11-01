import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  const v = page.locator('[data-vehicles]')
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/en?map=16.00/55.68100/12.57000/-20.0/60.0')
    await expect(v).toHaveAttribute('data-tilt', '60', { timeout: 20000 })
    await page.waitForTimeout(4000)
    await step(`buildings ${scheme}`)
  }
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/en?map=13.50/55.68100/12.57000/-20.0/60.0')
  await expect(v).toHaveAttribute('data-tilt', '60', { timeout: 20000 })
  await page.waitForTimeout(3000)
  await step('footprints at 13.5')
}
