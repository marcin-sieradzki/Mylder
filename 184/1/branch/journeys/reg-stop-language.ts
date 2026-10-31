import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Feature stop-language, recipe "Language".
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  await step('English panel')
  await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await expect(page.getByRole('dialog', { name: 'Nørreport St.' }).getByRole('list', { name: 'Afgange' })).toBeVisible()
  await expect(page).toHaveURL(/\/da\?.*stop=27532/)
  await step('Danish panel after switch')
  await page.goto('/da?stop=27532&board=arrivals')
  const d = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(d.getByRole('tab', { name: 'Afgange' })).toBeVisible()
  await expect(d.getByRole('tab', { name: 'Ankomster' })).toHaveAttribute('aria-selected', 'true')
  const dtp = d.getByRole('tabpanel', { name: 'Ankomster' })
  await expect(dtp.getByRole('list', { name: 'Ankomster' })).toBeVisible()
  await expect(dtp).toContainText('Fra Holte St.')
  await step('Danish Arrivals')
  await page.goto('/da?stop=8600683&board=arrivals')
  await expect(page.getByRole('dialog', { name: 'Hillerød St.' }).getByRole('tabpanel', { name: 'Ankomster' })).toContainText('Ingen ankomster de næste 30 minutter for de viste transportformer.')
  await step('Danish empty Arrivals')
}
