import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// stop-open (from the map) and stop-list, desktop.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?map=15.00/55.6925/12.58779')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map at Østerport')
  const vp = page.viewportSize()!
  const panel = page.getByRole('dialog', { name: 'Østerport St.' })
  await expect(async () => {
    await page.mouse.click(vp.width / 2, vp.height / 2)
    await expect(panel).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 20000 })
  await expect(page).toHaveURL(/[?&]stop=/)
  const tablist = panel.getByRole('tablist', { name: 'Departures and arrivals' })
  await expect(tablist.getByRole('tab', { name: 'Departures' })).toHaveAttribute('aria-selected', 'true')
  const first = panel.getByRole('list', { name: 'Departures' }).getByRole('listitem').first()
  await expect(first).toBeVisible()
  await expect(first).toContainText(/Now|\d+\s*min/)
  await step('Østerport panel, departures')
}
