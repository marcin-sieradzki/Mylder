import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// stop-standing none, desktop, English and Danish.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await expect(region.getByRole('list')).toHaveCount(0)
  await step('Nørreport empty text')
  await page.goto('/da?stop=27532')
  await expect(page.getByRole('dialog', { name: 'Nørreport St.' }).getByRole('region', { name: 'Ved perronerne nu' })).toBeVisible()
  await step('Danish region')
}
