import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

const EN = "Timetable only: live positions aren't connected yet, so every vehicle is placed where its timetable says it should be."
const EN_LEGEND = "Every vehicle is Timetable only for now: live positions aren't connected yet."
const DA = 'Kun køreplan: der er endnu ingen livepositioner, så hvert køretøj er placeret, hvor køreplanen siger, det skal være.'
const DA_LEGEND = 'Alle køretøjer er Kun køreplan indtil videre: der er endnu ingen livepositioner.'
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const outside = (page: Journey['page']) => page.locator('[role=status]:not([role=dialog] [role=status])')

export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await step('map loaded en')
  const snap = await (await page.request.get('/api/snapshot')).json()
  expect(snap.source).toEqual({ kind: 'timetable' })
  for (const t of snap.trips) expect(t.state, t.key).toBe('timetable-only')
  await expect(async () => {
    const n = Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles'))
    expect(n).toBeGreaterThan(0)
  }).toPass()
  console.log('data-vehicles', await page.locator('[data-vehicles]').getAttribute('data-vehicles'), 'trips', snap.trips.length)
  await expect(outside(page)).toHaveCount(1)
  await expect(outside(page)).toHaveText(new RegExp('^' + esc(EN) + '( Planes: .*)?$'))
  console.log('status en', JSON.stringify(await outside(page).allTextContents()))
  await expect(page.getByText(/paused|hasn't answered/i)).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Data states' }).locator('..')).toContainText(EN_LEGEND)
  // The Updated line reads the snapshot's fetched time.
  const s2 = await (await page.request.get('/api/snapshot')).json()
  const hhmmss = (ms: number) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(ms)
  const shown = await page.getByRole('banner').getByText(/^Updated /).textContent()
  console.log('updated line', shown, 'fetched', hhmmss(snap.fetched), hhmmss(s2.fetched))
  expect([`Updated ${hhmmss(snap.fetched)}`, `Updated ${hhmmss(s2.fetched)}`]).toContain(shown)
  await step('banner and legend en')

  await page.goto('/da')
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await expect(outside(page)).toHaveCount(1)
  await expect(outside(page)).toHaveText(new RegExp('^' + esc(DA)))
  await expect(page.getByText(DA_LEGEND)).toBeAttached()
  await expect(page.getByText(/pause|svaret/i)).toHaveCount(0)
  console.log('status da', JSON.stringify(await outside(page).allTextContents()))
  await step('banner and legend da')
}
