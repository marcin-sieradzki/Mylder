import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule (criterion 1's rider side, ADR 0006): open a Metro-only stop's Arrivals (Bella Center St. until 07:26, else Vestamager St.)
// -> an "Every N min" row with "Metro: planned times", and the month's call count grows only by the minute's own calls.
type Snap = { fetched: number; budget: { calls: number }; status: { calls: unknown[] } }
export default async ({ page, step, expect }: Journey) => {
  const snap = async () => (await (await page.request.get('/api/snapshot')).json()) as Snap
  const nextRun = async (after: number) => { let s = await snap(); while (s.fetched === after) { await page.waitForTimeout(1000); s = await snap() } return s }
  const hhmmss = (t: number) => new Date(t + 2 * 3600e3).toISOString().slice(11, 19)
  const reqs: string[] = [], srcs: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/stops')) reqs.push(hhmmss(Date.now()) + ' ' + new URL(r.url()).pathname) })
  page.on('response', async (r) => { if (r.url().includes('/api/stops')) srcs.push(new URL(r.url()).pathname + ' ' + JSON.stringify((await r.json().catch(() => null))?.source)) })
  const first = await snap()
  const s0 = await nextRun(first.fetched)
  console.log('s0', hhmmss(s0.fetched), 'calls', s0.budget.calls)
  if (s0.fetched >= Date.parse('2026-06-16T05:29:00Z')) throw new Error('Precondition missed: recording past 07:29, no Metro arrival left in the window')
  const [id, name] = s0.fetched < Date.parse('2026-06-16T05:25:00Z') ? ['8603313', 'Bella Center St.'] : ['8603317', 'Vestamager St.']
  await page.goto('/en?stop=' + id)
  const panel = page.getByRole('dialog', { name })
  await expect(panel.getByRole('tablist', { name: 'Departures and arrivals' })).toBeVisible()
  await step(name + ' opened')
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(page).toHaveURL(new RegExp('stop=' + id + '&board=arrivals'))
  const tp = panel.getByRole('tabpanel', { name: 'Arrivals' })
  const row = tp.getByRole('list', { name: 'Arrivals' }).getByRole('listitem').filter({ hasText: 'M1' }).first()
  await expect(row).toContainText('From Vanløse St.')
  await expect(row).toContainText(/Every \d+ min/)
  expect(await row.innerText()).not.toMatch(/\d\d:\d\d/)
  await expect(tp).toContainText('Metro: planned times')
  console.log('TABPANEL:\n' + (await tp.innerText()))
  await step('Metro interval row')
  const s1 = await nextRun(s0.fetched)
  console.log('s1', hhmmss(s1.fetched), 'calls', s1.budget.calls, 'run calls', JSON.stringify(s1.status.calls))
  console.log('requests:\n' + reqs.join('\n') + '\nsources:\n' + srcs.join('\n'))
  expect(reqs.some((r) => r.endsWith('/arrivals'))).toBe(true)
  expect(s1.budget.calls - s0.budget.calls).toBe(s1.status.calls.length)
  await step('a minute later: no on-demand call spent')
}
