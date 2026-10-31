import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule 3: phone, Nørreport St. by link: the row's place shows the empty text.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=27532')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await page.getByRole('dialog', { name: 'Overview' }).getByRole('button', { name: 'Close' }).click()
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute('data-anchor', 'bottom')
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await expect(region.getByRole('list')).toHaveCount(0)
  const tb = (await panel.getByRole('tablist', { name: 'Departures and arrivals' }).boundingBox())!
  const rb = (await region.boundingBox())!
  expect(rb.y + rb.height).toBeLessThanOrEqual(tb.y + 1)
  await step('Nørreport: empty text above the tabs')
}
