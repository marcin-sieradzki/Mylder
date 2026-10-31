import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { record, paints, outOfDate, summary, nowWord } from './paints.ts'
// Feature stop-first-paint, recipe "First paint" as the feature file words it: Nørreport St. by link, no row read Now in any paint;
// then København Syd St.'s Arrivals by link, no dialog text held "may be out of date".
export default async ({ page, step, expect }: Journey) => {
  await record(page)
  await page.goto('/en?stop=27532')
  const first = page.getByRole('dialog', { name: 'Nørreport St.' }).getByRole('list', { name: 'Departures' }).getByRole('listitem').first()
  await expect(first).toContainText(/\d+ min/, { timeout: 15000 })
  await step('Nørreport St. settled')
  const a = await paints(page)
  console.log(`NØRREPORT PAINTS (${a.length}):\n` + summary(a))
  expect(a.flatMap((p) => p.dialogs.flatMap((d) => d.lists.flatMap((l) => l.rows.filter((r) => nowWord.test(r))))), 'rows reading Now').toEqual([])
  await page.goto('/en?stop=8600783&board=arrivals')
  const tp = page.getByRole('dialog', { name: 'København Syd St.' }).getByRole('tabpanel', { name: 'Arrivals' })
  await expect(tp).toContainText('Rejseplanen', { timeout: 15000 })
  await expect(tp).toContainText(/arrivals \d\d:\d\d/)
  await page.waitForTimeout(1500)
  await step('København Syd St. Arrivals settled')
  const b = await paints(page)
  console.log(`KØBENHAVN SYD PAINTS (${b.length}):\n` + summary(b))
  expect(outOfDate(b), 'dialog text saying may be out of date').toEqual([])
}
