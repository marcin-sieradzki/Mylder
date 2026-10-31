import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { record, paints, falseNows, outOfDate, summary, nowWord } from './paints.ts'
// Pass rule 1, standing rows: open a link to Refshaleøen while the 991 stands there (run's first three minutes) -> at no paint does a standing or departure row more than 45 s away read "Now",
// and no paint says "may be out of date".
export default async ({ page, step, expect }: Journey) => {
  await record(page)
  const fetched = Number((await (await page.request.get('/api/snapshot')).json()).fetched)
  console.log('snapshot fetched', new Date(fetched).toISOString())
  await page.goto('/en?stop=48645')
  await step('link opened, earliest screen')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  const first = panel.getByRole('region', { name: 'At the platforms now' }).getByRole('listitem').first()
  await expect(first).toContainText(/\d+ min|Now/, { timeout: 15000 })
  await expect(first).toContainText('991')
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
