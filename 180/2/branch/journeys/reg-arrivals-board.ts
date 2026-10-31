import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Feature stop-arrivals, recipe "Arrivals from the board" (København Syd St. by link).
export default async ({ page, step, expect }: Journey) => {
  const fetched = Number((await (await page.request.get('/api/snapshot')).json()).fetched)
  console.log('snapshot fetched', new Date(fetched).toISOString())
  await page.goto('/en?stop=8600783&board=arrivals')
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  const tp = panel.getByRole('tabpanel', { name: 'Arrivals' })
  const rows = tp.getByRole('list', { name: 'Arrivals' }).getByRole('listitem')
  await expect(rows.first()).toBeVisible()
  console.log('TABPANEL:\n' + (await tp.innerText()))
  await expect(tp).toContainText(/Rejseplanen\s·\s+arrivals \d\d:\d\d:\d\d/)
  await expect(tp).toContainText("Countdowns use Rejseplanen's expected times where it has them; the rest use the timetable, and say so.")
  await expect(tp).not.toContainText('From the timetable')
  await expect(tp).not.toContainText('Timetable and positions')
  const n = await rows.count()
  for (let i = 0; i < n; i++) await expect(rows.nth(i)).toContainText('Track 8')
  if (fetched < Date.parse('2026-06-16T05:22:00Z')) {
    const re = rows.first()
    await expect(re).toContainText('RE'); await expect(re).toContainText('From København H'); await expect(re).toContainText('07:21'); await expect(re).toContainText('07:22')
  }
  if (fetched < Date.parse('2026-06-16T05:27:00Z')) {
    const a = rows.filter({ hasText: 'From Hundige St.' }).filter({ hasText: '07:23' }).first()
    await expect(a).toContainText('A'); await expect(a).toContainText('07:27'); await expect(a).toContainText('+4')
    expect(await a.locator('time', { hasText: '07:23' }).evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('line-through')
  }
  const e = rows.filter({ hasText: 'From Holte St.' }).first()
  await expect(e).toContainText('E'); await expect(e).toContainText('07:39'); await expect(e).toContainText('07:41'); await expect(e).toContainText('+2')
  expect(await e.locator('time', { hasText: '07:39' }).evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('line-through')
  const t1 = (await tp.innerText()).match(/arrivals (\d\d:\d\d:\d\d)/)![1]
  await step('København Syd St. Arrivals from the board')
  await page.goto('/en?stop=8600783&board=arrivals')
  await expect(panel.getByRole('tabpanel', { name: 'Arrivals' })).toContainText(new RegExp('Rejseplanen\\s·\\s+arrivals ' + t1))
  await step('opened again: same call time ' + t1)
}
