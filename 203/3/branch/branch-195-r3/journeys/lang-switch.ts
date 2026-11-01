import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?line=5C')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 20000 })
  await step('english')
  await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()
  await expect(page).toHaveURL(/\/da\?line=5C/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await step('dansk')
  await page.getByRole('navigation', { name: 'Sprog' }).getByRole('link', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/en\?line=5C/)
  await step('english again')
}
