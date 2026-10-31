import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// lang-switch: Dansk keeps the query; English back.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?line=5C')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 30000 })
  await step('english with line=5C')
  await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()
  await expect(page).toHaveURL(/\/da\?line=5C$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await step('dansk keeps the line')
  await page.getByRole('navigation', { name: 'Sprog' }).getByRole('link', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/en\?line=5C$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await step('english again')
}
