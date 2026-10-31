import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Regression, moving-map map-draw and map-chrome.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '17', { timeout: 20_000 })
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })).toBeVisible()
  await step('map drawn with 17 dots and its chrome')
}
