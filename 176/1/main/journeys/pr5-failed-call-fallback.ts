import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule (criterion 1's rider side, US 25): open Nørreport St.'s Arrivals, whose arrival-board call fails on the recording ->
// the trips still listed from the timetable moved by the map's delays (E From Holte St. with its delay, planned time struck, the
// moved time), no track, and the panel says so: "From the timetable", the note "Countdowns use the timetable, moved by the delay",
// and "Timetable and positions HH:MM:SS". The month's call count is logged to show the call was tried.
type Snap = { fetched: number; budget: { calls: number }; status: { calls: unknown[] } }
export default async ({ page, step, expect }: Journey) => {
  const snap = async () => (await (await page.request.get('/api/snapshot')).json()) as Snap
  const nextRun = async (after: number) => { let s = await snap(); while (s.fetched === after) { await page.waitForTimeout(1000); s = await snap() } return s }
  const hhmmss = (t: number) => new Date(t + 2 * 3600e3).toISOString().slice(11, 19)
  const reqs: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/stops')) reqs.push(hhmmss(Date.now()) + ' ' + new URL(r.url()).pathname) })
  const first = await snap()
  const s0 = await nextRun(first.fetched)
  console.log('s0', hhmmss(s0.fetched), 'calls', s0.budget.calls)
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  await step('Nørreport St. on Departures')
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  const tp = panel.getByRole('tabpanel', { name: 'Arrivals' })
  const rows = tp.getByRole('list', { name: 'Arrivals' }).getByRole('listitem')
  await expect(rows.first()).toBeVisible()
  console.log('TABPANEL:\n' + (await tp.innerText()))
  const holte = rows.filter({ hasText: 'From Holte St.' }).first()
  await expect(holte).toContainText('E')
  await expect(holte).toContainText(/Live|Ageing|Estimated/)
  await expect(holte).toContainText(/\+\d/)
  await expect(holte).toContainText('07:27')
  const deco = await holte.locator('time', { hasText: '07:27' }).first().evaluate((el) => getComputedStyle(el).textDecorationLine)
  console.log('07:27 decoration:', deco)
  expect(deco).toContain('line-through')
  await expect(tp).not.toContainText('Track')
  await expect(tp).toContainText('From the timetable')
  await expect(tp).toContainText('Countdowns use the timetable, moved by the delay')
  await expect(tp).toContainText(/Timetable and positions \d\d:\d\d:\d\d/)
  await expect(tp).not.toContainText(/Rejseplanen\s·\s+arrivals/)
  await step('Arrivals from the timetable with the delays')
  const s1 = await nextRun(s0.fetched)
  console.log('s1', hhmmss(s1.fetched), 'calls', s1.budget.calls, 'delta', s1.budget.calls - s0.budget.calls, 'run calls', s1.status.calls.length)
  console.log('requests:\n' + reqs.join('\n'))
}
