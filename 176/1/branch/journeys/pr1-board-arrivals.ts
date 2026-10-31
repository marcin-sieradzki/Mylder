import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule (criterion 3, US 15/24): open København Syd St. and choose the Arrivals tab -> every row on Track 8 with
// Rejseplanen's expected times (planned time struck, the expected time beside it, the delay), Estimated rows with "~",
// and under the list "Rejseplanen · arrivals HH:MM:SS" (the time the server called it); no "From the timetable".
export default async ({ page, step, expect }: Journey) => {
  const urls: string[] = []
  const answers: unknown[] = []
  page.on('request', (r) => urls.push(r.url()))
  page.on('response', async (r) => { if (new URL(r.url()).pathname.endsWith('/arrivals')) answers.push((await r.json().catch(() => null))?.source) })
  await page.goto('/en?stop=8600783')
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  await expect(panel.getByRole('tabpanel', { name: 'Departures' }).getByRole('list', { name: 'Departures' })).toBeVisible()
  expect(urls.filter((u) => new URL(u).pathname.endsWith('/arrivals'))).toHaveLength(0)
  await step('København Syd St. on Departures')
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(page).toHaveURL(/\?stop=8600783&board=arrivals$/)
  const tp = panel.getByRole('tabpanel', { name: 'Arrivals' })
  const rows = tp.getByRole('list', { name: 'Arrivals' }).getByRole('listitem')
  await expect(rows.first()).toBeVisible()
  console.log('TABPANEL:\n' + (await tp.innerText()))
  console.log('arrival answers source:', JSON.stringify(answers))
  await expect(tp).toContainText(/Rejseplanen\s·\s+arrivals \d\d:\d\d:\d\d/)
  await expect(tp).toContainText("Countdowns use Rejseplanen's expected times where it has them; the rest use the timetable, and say so.")
  await expect(tp).not.toContainText('From the timetable')
  await expect(tp).not.toContainText('Timetable and positions')
  const n = await rows.count()
  for (let i = 0; i < n; i++) await expect(rows.nth(i)).toContainText('Track 8')
  const holte = rows.filter({ hasText: 'From Holte St.' }).first()
  await expect(holte).toContainText('E')
  await expect(holte).toContainText('+2')
  await expect(holte).toContainText('07:41')
  const planned = holte.locator('time', { hasText: '07:39' })
  const deco = await planned.evaluate((el) => getComputedStyle(el).textDecorationLine)
  console.log('07:39 decoration:', deco)
  expect(deco).toContain('line-through')
  const est = rows.filter({ hasText: 'Estimated' })
  if ((await est.count()) > 0) await expect(est.first()).toContainText(/~/)
  const src = (await tp.innerText()).match(/arrivals (\d\d:\d\d:\d\d)/)![1]
  const at = (answers.find((a) => (a as { kind?: string })?.kind === 'rejseplanen') as { at: number }).at
  const atLocal = new Date(at + 2 * 3600e3).toISOString().slice(11, 19)
  console.log('source line time', src, 'answer at (CEST)', atLocal)
  expect(src).toBe(atLocal)
  await step('Arrivals from the board with tracks and source line')
}
