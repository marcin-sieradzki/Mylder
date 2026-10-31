import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?map=15.00/55.6925/12.58779')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map centred on Østerport St.')
  const panel = page.getByRole('dialog', { name: 'Østerport St.' })
  await expect(async () => {
    const v = page.viewportSize()!
    await page.mouse.click(v.width / 2, v.height / 2)
    await expect(panel).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 30000 })
  await expect(page).toHaveURL(/[?&]stop=/)
  await step('Østerport St. panel open from the map')
  const first = panel.getByRole('list', { name: 'Departures' }).getByRole('listitem').first()
  await expect(first).toBeVisible()
  await expect(first).toContainText(/\d+ min|Now/)
  await expect(panel.getByRole('region', { name: 'At the platforms now' })).toBeVisible()
  await step('departures listed')
}
