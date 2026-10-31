import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Regression, moving map: at phone size a tilted link opens tilted with the buildings standing, and
// neither the 3D toggle nor the compass shows; in Danish (desktop run) they are named 3D-visning and Drej mod nord.
export default async ({ page, step, expect }: Journey) => {
  const map = page.locator('[data-vehicles]')
  const phone = (page.viewportSize()?.width ?? 1000) < 600
  if (phone) {
    await page.goto('/en?map=16.00/55.68000/12.57000/-30.0/60.0')
    await expect(map).toHaveAttribute('data-tilt', '60', { timeout: 30000 })
    await expect(map).toHaveAttribute('data-heading', '-30')
    await expect(page.getByRole('button', { name: '3D view' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reset to north' })).toHaveCount(0)
    await page.waitForTimeout(12000)
    await step('phone tilted link')
    return
  }
  await page.goto('/da?map=16.00/55.68000/12.57000/-30.0/60.0')
  await expect(map).toHaveAttribute('data-tilt', '60', { timeout: 30000 })
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await expect(page.getByRole('button', { name: '3D-visning' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Drej mod nord' })).toBeVisible()
  await page.waitForTimeout(12000)
  await step('danish tilted link')
}
