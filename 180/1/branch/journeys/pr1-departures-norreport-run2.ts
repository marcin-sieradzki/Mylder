import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { record, paints, falseNows, outOfDate, summary, nowWord } from './paints.ts'
// Pass rule 1: open a link to Nørreport St. (Departures) -> at no paint does a departure or standing row more than 45 s away read "Now",
// and no paint says "may be out of date".
export default async ({ page, step, expect }: Journey) => {
  await record(page)
  const fetched = Number((await (await page.request.get('/api/snapshot')).json()).fetched)
  console.log('snapshot fetched', new Date(fetched).toISOString())
  await page.goto('/en?stop=27532')
  await step('link opened, earliest screen')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  const first = panel.getByRole('list', { name: 'Departures' }).getByRole('listitem').first()
  await expect(first).toContainText(/\d+ min/, { timeout: 15000 })
  await page.waitForTimeout(2000)
  await step('clock settled, countdowns in minutes')
  const all = await paints(page)
  const settled = all[all.length - 1]
  console.log(`PAINTS (${all.length}):\n` + summary(all))
  console.log('SETTLED ROWS:', JSON.stringify(settled.dialogs.map((d) => d.lists)))
  const anyNow = all.some((p) => p.dialogs.some((d) => d.lists.some((l) => l.rows.some((r) => nowWord.test(r)))))
  console.log('any row read Now in any paint:', anyNow)
  const dash = all.some((p) => p.dialogs.some((d) => d.lists.some((l) => l.rows.some((r) => /—/.test(r)))))
  console.log('a row read — in some paint:', dash)
  expect(all.length, 'paints recorded').toBeGreaterThan(0)
  expect(falseNows(all, settled), 'rows reading Now before the clock settled').toEqual([])
  expect(outOfDate(all), 'paints saying may be out of date').toEqual([])
}
