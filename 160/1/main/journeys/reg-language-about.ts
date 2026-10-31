import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?line=5C')
  await ready(page, expect)
  await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()
  await expect(page).toHaveURL(/\/da\?line=5C/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await step('Danish, query kept')
  await page.getByRole('navigation', { name: 'Sprog' }).getByRole('link', { name: 'English' }).click()
  await expect(page).toHaveURL(/\/en\?line=5C/)
  await page.getByRole('button', { name: 'About Mylder' }).click()
  const about = page.getByRole('dialog', { name: 'About Mylder' })
  await expect(about).toBeVisible()
  await expect(about.getByRole('region', { name: 'Data states' })).toBeVisible()
  await expect(about.getByRole('region', { name: 'Keys' })).toBeVisible()
  await step('About')
  await page.keyboard.press('Escape')
  await expect(about).toBeHidden()
  await step('About closed')
}
