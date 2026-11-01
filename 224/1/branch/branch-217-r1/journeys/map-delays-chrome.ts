import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

const EN_BANNER = "Timetable and delays: live positions aren't connected yet, so each vehicle is placed from its timetable and, where Rejseplanen has sent one, its delay."
const EN_LEGEND = "For now a vehicle is Estimated, placed from its delay, or Timetable only: live positions aren't connected yet."
const DA_BANNER = 'Køreplan og forsinkelser: der er endnu ingen livepositioner, så hvert køretøj er placeret ud fra sin køreplan og, hvor Rejseplanen har sendt en, sin forsinkelse.'
const DA_LEGEND = 'Indtil videre er et køretøj Beregnet, placeret ud fra sin forsinkelse, eller Kun køreplan: der er endnu ingen livepositioner.'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const outside = (page: Journey['page']) =>
  page.locator('[role=status]:not([role=dialog] [role=status])')

export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  console.log('updates', JSON.stringify(snap.updates))
  expect(snap.updates.kind).toBe('recording')
  expect(snap.updates.fresh).toBe(true)
  const states = new Set(snap.trips.map((t: { state: string }) => t.state))
  console.log('states', [...states])
  for (const s of states) expect(['estimated', 'timetable-only']).toContain(s)
  for (const t of snap.trips) {
    if (t.mode === 'metro' || t.mode === 'light-rail') expect(t.state, t.key).toBe('timetable-only')
    if (t.state === 'estimated') expect(t.updated, t.key).toBeTruthy()
  }
  expect(snap.trips.some((t: { state: string }) => t.state === 'estimated')).toBe(true)

  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map loaded en')
  await expect(outside(page)).toHaveCount(1)
  await expect(outside(page)).toHaveText(new RegExp('^' + esc(EN_BANNER) + '( Planes: .*)?$'))
  await expect(page.getByRole('list', { name: 'Data states' }).locator('..')).toContainText(EN_LEGEND)
  await expect(page.getByText(/paused|hasn't answered/i)).toHaveCount(0)
  console.log('statuses en', JSON.stringify(await outside(page).allTextContents()))
  await step('banner and legend en')

  await page.goto('/da')
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await expect(outside(page)).toHaveCount(1)
  await expect(outside(page)).toHaveText(new RegExp('^' + esc(DA_BANNER)))
  console.log('statuses da', JSON.stringify(await outside(page).allTextContents()))
  await expect(page.getByText(DA_LEGEND)).toBeAttached()
  await step('banner and legend da')
}
