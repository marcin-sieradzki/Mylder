import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=8600650')
  const panel = page.getByRole('dialog', { name: 'Østerport St.' })
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  await step('English panel')
  await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await expect(page.getByRole('dialog', { name: 'Østerport St.' }).getByRole('list', { name: 'Afgange' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Østerport St.' }).getByRole('region', { name: 'Ved perronerne nu' })).toBeVisible()
  await expect(page).toHaveURL(/\/da\?.*stop=8600650/)
  await step('Danish panel after switch')
}
