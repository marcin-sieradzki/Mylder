import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// stop-language and stop-missing, desktop.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=27532')
  await expect(page.getByRole('dialog', { name: 'Nørreport St.' })).toBeVisible()
  await step('english')
  await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()
  await expect(page).toHaveURL(/\/da\?stop=27532/)
  await expect(page.getByRole('dialog', { name: 'Nørreport St.' }).getByRole('list', { name: 'Afgange' })).toBeVisible()
  await step('dansk')
  await page.goto('/da?stop=27532&board=arrivals')
  const p = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(p.getByRole('tab', { name: 'Afgange' })).toBeVisible()
  await expect(p.getByRole('tab', { name: 'Ankomster' })).toBeVisible()
  await expect(p.getByRole('list', { name: 'Ankomster' })).toContainText('Fra Holte St.')
  await step('ankomster')
  await page.goto('/da?stop=8600683&board=arrivals')
  await expect(page.getByRole('tabpanel', { name: 'Ankomster' })).toContainText('Ingen ankomster de næste 30 minutter for de viste transportformer.')
  await page.goto('/en?stop=nowhere')
  await expect(page.getByRole('dialog', { name: 'Stop not found' })).toBeVisible()
  await step('missing')
}
