import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule: open a stop from the map -> Departures and Arrivals tabs, Departures selected, today's departure list under it.
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
  expect(page.url()).not.toMatch(/board=/)
  await step('Østerport St. panel open from the map')
  const tablist = panel.getByRole('tablist', { name: 'Departures and arrivals' })
  await expect(tablist).toBeVisible()
  await expect(tablist.getByRole('tab')).toHaveText(['Departures', 'Arrivals'])
  await expect(tablist.getByRole('tab', { name: 'Departures' })).toHaveAttribute('aria-selected', 'true')
  await expect(tablist.getByRole('tab', { name: 'Arrivals' })).toHaveAttribute('aria-selected', 'false')
  const tp = panel.getByRole('tabpanel', { name: 'Departures' })
  await expect(tp).toBeVisible()
  const first = tp.getByRole('list', { name: 'Departures' }).getByRole('listitem').first()
  await expect(first).toBeVisible()
  await expect(first).toContainText(/\d+ min|Now|[Ee]very \d+ min/)
  console.log('FIRST DEPARTURE:', await first.innerText())
  const a = await panel.getByRole('region', { name: 'At the platforms now' }).boundingBox(), b = await tablist.boundingBox()
  expect(a!.y).toBeLessThan(b!.y)
  await step('tabs with Departures selected and departures listed')
}
