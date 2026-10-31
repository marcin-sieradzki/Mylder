import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Side check: on a phone, does a ?stop= link show the stop's panel, or the Overview sheet over it?
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=8600683')
  const panel = page.getByRole('dialog', { name: 'Hillerød St.' })
  await expect(panel).toBeAttached()
  await page.waitForTimeout(2000)
  await step('Hillerød St. link on a phone')
  console.log('overview visible:', await page.getByRole('dialog', { name: 'Overview' }).isVisible())
  const box = await panel.boundingBox()
  console.log('stop panel box:', JSON.stringify(box), 'viewport', JSON.stringify(page.viewportSize()))
  await panel.getByRole('list', { name: 'Departures' }).or(panel.getByText(/No departures/)).first().click({ timeout: 5000, trial: true }).then(() => console.log('stop panel content clickable'), (e) => console.log('stop panel content NOT clickable:', String(e).split('\n').filter((l) => l.includes('intercepts')).slice(0, 1)))
}
