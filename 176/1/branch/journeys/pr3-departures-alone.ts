import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule (criterion 5, US 26): open København Syd St. and stay on Departures through a whole minute -> no arrivals are asked
// and the month's call count grows only by the minute's own calls and the departure board; choosing Arrivals then adds one call.
type Snap = { fetched: number; budget: { calls: number }; status: { calls: unknown[] } }
export default async ({ page, step, expect }: Journey) => {
  const snap = async () => (await (await page.request.get('/api/snapshot')).json()) as Snap
  const nextRun = async (after: number) => { let s = await snap(); while (s.fetched === after) { await page.waitForTimeout(1000); s = await snap() } return s }
  const hhmmss = (t: number) => new Date(t + 2 * 3600e3).toISOString().slice(11, 19)
  const depAt = new Set<number>(), arrAt = new Set<number>(), reqs: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/stops')) reqs.push(hhmmss(Date.now()) + ' ' + new URL(r.url()).pathname) })
  page.on('response', async (r) => {
    const p = new URL(r.url()).pathname
    if (!p.startsWith('/api/stops/8600783')) return
    const s = (await r.json().catch(() => null))?.source
    if (s?.kind === 'rejseplanen') (p.endsWith('/arrivals') ? arrAt : depAt).add(s.at)
  })
  const first = await snap()
  const s0 = await nextRun(first.fetched)
  console.log('s0', hhmmss(s0.fetched), 'calls', s0.budget.calls)
  await page.goto('/en?stop=8600783')
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  await expect(panel.getByRole('tabpanel', { name: 'Departures' }).getByRole('list', { name: 'Departures' })).toBeVisible()
  await step('København Syd St. on Departures')
  const s1 = await nextRun(s0.fetched)
  const depA = [...depAt].filter((a) => a > s0.fetched && a <= s1.fetched)
  console.log('s1', hhmmss(s1.fetched), 'calls', s1.budget.calls, 'run calls', JSON.stringify(s1.status.calls), 'departure calls', depA.map(hhmmss), 'arrival calls', [...arrAt].map(hhmmss))
  console.log('requests so far:\n' + reqs.join('\n'))
  expect(reqs.filter((r) => r.endsWith('/arrivals'))).toHaveLength(0)
  expect(arrAt.size).toBe(0)
  expect(s1.budget.calls - s0.budget.calls).toBe(s1.status.calls.length + depA.length)
  await step('a whole minute on Departures: no arrival call')
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(panel.getByRole('tabpanel', { name: 'Arrivals' }).getByRole('list', { name: 'Arrivals' })).toBeVisible()
  console.log('ARRIVALS source line:', (await panel.getByRole('tabpanel', { name: 'Arrivals' }).innerText()).split('\n').slice(-2).join(' | '))
  await step('Arrivals chosen')
  const s2 = await nextRun(s1.fetched)
  const depB = [...depAt].filter((a) => a > s1.fetched), arrB = [...arrAt].filter((a) => a > s1.fetched)
  console.log('s2', hhmmss(s2.fetched), 'calls', s2.budget.calls, 'run calls', JSON.stringify(s2.status.calls), 'departure calls', depB.map(hhmmss), 'arrival calls', arrB.map(hhmmss))
  console.log('all requests:\n' + reqs.join('\n'))
  expect(arrB).toHaveLength(1)
  expect(s2.budget.calls - s1.budget.calls).toBe(s2.status.calls.length + depB.length + 1)
  await page.getByRole('button', { name: 'About Mylder' }).click()
  const about = page.getByRole('dialog', { name: 'About Mylder' })
  await expect(about).toContainText('Calls this month')
  await page.waitForTimeout(1500)
  console.log('About:', (await about.innerText()).match(/Calls this month\s*\n?\s*[\d,]+/)?.[0])
  await step('About: calls this month')
}
