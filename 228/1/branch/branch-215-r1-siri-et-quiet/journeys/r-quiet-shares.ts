// Regression, overview-delays on updates:siri-et/quiet: once the feed is quiet, the trips with an update are
// No signal and City pulse's "With delays, by mode" shares hold, each still counting them.
import { type Journey, snapshot } from '/home/user/mylder-verify/215-journeys/lib.ts'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function shares(page: Journey['page']) {
  const region = page.getByRole('dialog', { name: 'Overview' }).getByRole('region', { name: 'With delays, by mode' })
  const out: Record<string, string> = {}
  for (const m of await region.getByRole('meter').all()) out[(await m.innerText()).split('\n')[0].trim()] = (await m.locator('xpath=following-sibling::*[1]').innerText()).trim()
  return out
}
export default async ({ page, step, expect }: Journey) => {
  const s0 = await snapshot(page)
  console.log('start fresh', s0.updates.fresh, '(the fresh phase was captured by the first drive, r-quiet-shares-first)')
  await page.goto('/en')
  await expect(page.getByRole('dialog', { name: 'Overview' }).getByRole('region', { name: 'With delays, by mode' })).toBeVisible({ timeout: 30_000 })
  console.log('fresh shares', JSON.stringify(await shares(page)), 'avg', JSON.stringify(await page.getByRole('group', { name: 'Average delay' }).innerText().catch(() => 'none')))
  await step('pulse while fresh')
  let q: any
  const end = Date.now() + 540_000
  for (;;) { q = await snapshot(page); if (q.updates.fresh === false) break; if (Date.now() > end) throw new Error('precondition: the feed did not go quiet in 9 min'); await sleep(10_000) }
  for (const t of q.trips) expect(t.state, t.key).toBe(t.updated ? 'no-signal' : 'timetable-only')
  await page.goto('/en')
  const region = page.getByRole('dialog', { name: 'Overview' }).getByRole('region', { name: 'With delays, by mode' })
  await expect(region).toBeVisible({ timeout: 30_000 })
  await expect.poll(async () => {
    const s = await snapshot(page)
    const got = await shares(page)
    const bad: string[] = []
    for (const [mode, name, op] of [['bus', 'Bus', 'Movia'], ['s-tog', 'S-tog', 'DSB'], ['train', 'Train', 'DSB']]) {
      const ts = s.trips.filter((t: any) => t.mode === mode && !t.cancelled)
      if (!ts.length) continue
      const want = `${ts.filter((t: any) => t.updated).length}/${ts.length} · ${op}`
      if (got[name] !== want) bad.push(`${name} "${got[name]}" vs "${want}"`)
      if (!ts.filter((t: any) => t.updated).length) bad.push(`${name} counts none`)
    }
    return bad.join('; ') || 'ok'
  }, { timeout: 75_000, intervals: [3000] }).toBe('ok')
  console.log('quiet shares', JSON.stringify(await shares(page)), 'avg', JSON.stringify(await page.getByRole('group', { name: 'Average delay' }).innerText().catch(() => 'none')))
  console.log('quiet updates', JSON.stringify(q.updates))
  await region.scrollIntoViewIfNeeded()
  await step('pulse with the feed quiet: shares hold')
}
