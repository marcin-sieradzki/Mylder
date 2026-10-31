import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { record, paints, falseNows, outOfDate, summary } from './paints.ts'
// Pass rule 4 on a phone, second run: open a link to København Syd St.'s Arrivals -> through the first paint (every paint up to and
// including the first one whose Arrivals rows all show a countdown), no paint says "may be out of date" and no row more than 45 s away reads "Now".
// Later paints are logged, not judged: the source line's minute-by-minute ageing is main's behaviour too (x-probe-source-aging).
export default async ({ page, step, expect }: Journey) => {
  await record(page)
  const fetched = Number((await (await page.request.get('/api/snapshot')).json()).fetched)
  console.log('snapshot fetched', new Date(fetched).toISOString())
  await page.goto('/en?stop=8600783&board=arrivals')
  await step('link opened, earliest screen')
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  const tp = panel.getByRole('tabpanel', { name: 'Arrivals' })
  await expect(tp).toContainText('Rejseplanen', { timeout: 15000 })
  await expect(tp).toContainText(/arrivals \S*\d\d:\d\d/)
  await expect(tp.getByRole('listitem').first()).toContainText(/\d+ min|Now/)
  await step('clock settled, Rejseplanen source line')
  const all = await paints(page)
  const rowsOf = (p: (typeof all)[number]) => p.dialogs.flatMap((d) => d.lists.filter((l) => l.label === 'Arrivals').flatMap((l) => l.rows))
  const idx = all.findIndex((p) => rowsOf(p).length > 0 && rowsOf(p).every((r) => /\d+ min|\bNow\b/.test(r) && !/—/.test(r)))
  expect(idx, 'a paint with every countdown shown').toBeGreaterThanOrEqual(0)
  const firstPaint = all.slice(0, idx + 1)
  console.log(`PAINTS (${all.length}, first paint ends at #${idx}, ${all[idx].t.toFixed(0)} ms):\n` + summary(all))
  console.log('later out-of-date (not judged):', JSON.stringify(outOfDate(all.slice(idx + 1)).map((o) => [o.t, o.text.slice(-60)])))
  expect(outOfDate(firstPaint), 'first-paint paints saying may be out of date').toEqual([])
  expect(falseNows(firstPaint, all[idx]), 'rows reading Now before the clock settled').toEqual([])
}
