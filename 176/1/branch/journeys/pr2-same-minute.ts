import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule (criterion 1's rider side): open København Syd St.'s Arrivals, leave it and open it again within the minute ->
// both show the same "Rejseplanen · arrivals HH:MM:SS"; the month's call count (About, "Calls this month") grows by one arrival call only.
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
  await page.goto('/en?stop=8600783&board=arrivals')
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  const tp = panel.getByRole('tabpanel', { name: 'Arrivals' })
  await expect(tp.getByRole('list', { name: 'Arrivals' })).toBeVisible()
  await expect(tp).toContainText(/Rejseplanen\s·\s+arrivals \d\d:\d\d:\d\d/)
  const t1 = (await tp.innerText()).match(/arrivals (\d\d:\d\d:\d\d)/)![1]
  console.log('first open: arrivals', t1)
  await step('first open, call time ' + t1)
  await panel.getByRole('tab', { name: 'Departures' }).click()
  await expect(panel.getByRole('tabpanel', { name: 'Departures' })).toBeVisible()
  await step('left Arrivals for Departures')
  await page.waitForTimeout(10000)
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(tp.getByRole('list', { name: 'Arrivals' })).toBeVisible()
  await expect(tp).toContainText(/Rejseplanen\s·\s+arrivals \d\d:\d\d:\d\d/)
  const t2 = (await tp.innerText()).match(/arrivals (\d\d:\d\d:\d\d)/)![1]
  console.log('second open: arrivals', t2)
  await step('second open within the minute, call time ' + t2)
  expect(t2).toBe(t1)
  await page.goto('/en?stop=8600783&board=arrivals')
  await expect(panel.getByRole('tabpanel', { name: 'Arrivals' })).toContainText(/Rejseplanen\s·\s+arrivals \d\d:\d\d:\d\d/)
  const t3 = (await panel.getByRole('tabpanel', { name: 'Arrivals' }).innerText()).match(/arrivals (\d\d:\d\d:\d\d)/)![1]
  console.log('third open (link again): arrivals', t3)
  await step('opened again by link, call time ' + t3)
  expect(t3).toBe(t1)
  const s1 = await nextRun(s0.fetched)
  const dep = [...depAt].filter((a) => a > s0.fetched), arr = [...arrAt].filter((a) => a > s0.fetched)
  console.log('s1', hhmmss(s1.fetched), 'calls', s1.budget.calls, 'run calls', JSON.stringify(s1.status.calls))
  console.log('departure calls', dep.map(hhmmss), 'arrival calls', arr.map(hhmmss))
  console.log('requests:\n' + reqs.join('\n'))
  expect(arr).toHaveLength(1)
  expect(s1.budget.calls - s0.budget.calls).toBe(s1.status.calls.length + dep.length + arr.length)
  await page.getByRole('button', { name: 'About Mylder' }).click()
  const about = page.getByRole('dialog', { name: 'About Mylder' })
  await expect(about).toContainText('Calls this month')
  await page.waitForTimeout(1500)
  console.log('About:', (await about.innerText()).match(/Calls this month\s*\n?\s*[\d,]+/)?.[0])
  await step('About: calls this month')
}
