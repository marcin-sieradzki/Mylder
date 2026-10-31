import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel.getByRole('tablist', { name: 'Departures and arrivals' })).toBeVisible()
  await step('Nørreport St. opened')
  const standing = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(standing).toBeVisible()
  await expect(standing).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await expect(standing.getByRole('list')).toHaveCount(0)
  await step('none standing said in words')
  await page.goto('/da?stop=27532')
  await expect(page.getByRole('dialog', { name: 'Nørreport St.' }).getByRole('region', { name: 'Ved perronerne nu' })).toBeVisible()
  await step('Danish region Ved perronerne nu')
}
