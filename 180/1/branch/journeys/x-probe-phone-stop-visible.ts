import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Side probe: on a phone, where is a linked stop's panel once the page has settled?
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel.getByRole('list', { name: 'Departures' }).getByRole('listitem').first()).toContainText(/\d+ min/, { timeout: 15000 })
  await page.waitForTimeout(4000)
  console.log('viewport', JSON.stringify(page.viewportSize()), 'stop box', JSON.stringify(await panel.boundingBox()), 'overview box', JSON.stringify(await page.getByRole('dialog', { name: 'Overview' }).boundingBox()))
  console.log('stop visible:', await panel.isVisible(), 'in viewport:', await panel.evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth }))
  await step('phone, 4 s after settling')
}
