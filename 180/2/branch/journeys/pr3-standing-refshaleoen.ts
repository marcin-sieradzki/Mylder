import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { record, paints, falseNows, outOfDate, summary, nowWord, rowHistory, fetchedAt } from './paints.ts'
// Pass rule 3: open a link to Refshaleøen while the 991 stands there (run's first three minutes) -> at no paint does the standing row
// (on a phone, the sideways card) or a departure row read "Now" unless it reads "Now" once settled; no paint says "may be out of date".
export default async ({ page, step, expect }: Journey) => {
  await record(page)
  const fetched = await fetchedAt(page)
  console.log('snapshot fetched', new Date(fetched).toISOString())
  if (fetched >= Date.parse('2026-06-16T05:22:45Z')) throw new Error('Precondition missed: recording at ' + new Date(fetched).toISOString() + ', the 991 leaves Refshaleøen about 07:23')
  await page.goto('/en?stop=48645')
  await step('link opened, earliest screen')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  const list = panel.getByRole('region', { name: 'At the platforms now' }).getByRole('list', { name: 'At the platforms now' })
  const card = list.getByRole('listitem').first()
  await expect(card).toContainText(/\d+ min|Now/, { timeout: 15000 })
  await expect(card).toContainText('991')
  await expect(card).toContainText('Teglholmen')
  await page.waitForTimeout(2000)
  await step('clock settled, countdowns in minutes')
  const overflowX = await list.evaluate((el) => getComputedStyle(el).overflowX)
  console.log('standing list overflow-x:', overflowX, 'viewport', JSON.stringify(page.viewportSize()))
  const all = await paints(page)
  const settled = all[all.length - 1]
  console.log(`PAINTS (${all.length}):\n` + summary(all))
  console.log('STANDING ROW HISTORY:\n' + rowHistory(all, /^At the platforms now$/).join('\n'))
  console.log('SETTLED ROWS:', JSON.stringify(settled.dialogs.map((d) => d.lists)))
  const anyNow = all.some((p) => p.dialogs.some((d) => d.lists.some((l) => l.rows.some((r) => nowWord.test(r)))))
  console.log('any row read Now in any paint:', anyNow)
  const dash = all.some((p) => p.dialogs.some((d) => d.lists.some((l) => /At the platforms now/.test(l.label) && l.rows.some((r) => /—/.test(r)))))
  console.log('the standing row read — in some paint:', dash)
  expect(all.length, 'paints recorded').toBeGreaterThan(0)
  expect(falseNows(all, settled), 'rows reading Now before the clock settled').toEqual([])
  expect(outOfDate(all), 'paints saying may be out of date').toEqual([])
}
