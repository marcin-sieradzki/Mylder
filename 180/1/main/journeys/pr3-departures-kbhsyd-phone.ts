import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { record, paints, falseNows, outOfDate, summary } from './paints.ts'
// Pass rule 3: open a link to København Syd St. (Departures, a fresh Rejseplanen board) -> no paint says "may be out of date",
// and no row more than 45 s away reads "Now".
export default async ({ page, step, expect }: Journey) => {
  await record(page)
  const fetched = Number((await (await page.request.get('/api/snapshot')).json()).fetched)
  console.log('snapshot fetched', new Date(fetched).toISOString())
  await page.goto('/en?stop=8600783')
  await step('link opened, earliest screen')
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  const tp = panel.getByRole('tabpanel', { name: 'Departures' })
  await expect(tp).toContainText('Rejseplanen', { timeout: 15000 })
  await expect(tp).toContainText(/departures \S*\d\d:\d\d/)
  await expect(tp.getByRole('listitem').first()).toContainText(/\d+ min|Now/)
  await page.waitForTimeout(2000)
  await step('clock settled, Rejseplanen source line')
  const all = await paints(page)
  const settled = all[all.length - 1]
  console.log(`PAINTS (${all.length}):\n` + summary(all))
  console.log('SETTLED SOURCE:', settled.dialogs.map((d) => d.text.replace(/\n/g, ' | ').slice(-250)))
  console.log('SETTLED ROWS:', JSON.stringify(settled.dialogs.map((d) => d.lists)))
  expect(all.length, 'paints recorded').toBeGreaterThan(0)
  expect(outOfDate(all), 'paints saying may be out of date').toEqual([])
  expect(falseNows(all, settled), 'rows reading Now before the clock settled').toEqual([])
}
