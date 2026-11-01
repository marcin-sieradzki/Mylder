import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
const BANNER = "Timetable and delays: live positions aren't connected yet, so each vehicle is placed from its timetable and, where Rejseplanen has sent one, its delay."
const LEGEND = "For now a vehicle is Estimated, placed from its delay, or Timetable only: live positions aren't connected yet."
export default async ({ page, step, expect }: Journey) => {
  await new Promise((r) => setTimeout(r, 65_000)) // the table fills over the first minute
  const s = await (await page.request.get('/api/snapshot')).json()
  console.log(JSON.stringify(s.updates))
  expect(s.updates.kind).toBe('recording')
  expect(s.updates.fresh).toBe(true)
  for (const t of s.trips) {
    expect(['estimated', 'timetable-only'], t.key).toContain(t.state)
    if (t.state === 'estimated') expect(t.updated, t.key).toBeTruthy()
    if (t.mode === 'metro') expect(t.state, t.key).toBe('timetable-only')
  }
  await page.goto('/en')
  await expect.poll(async () => {
    const n = (await (await page.request.get('/api/snapshot')).json()).trips.filter((t: any) => !t.cancelled).length
    return Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles')) - n
  }, { timeout: 30_000 }).toBe(0)
  await expect(page.getByRole('status').first()).toContainText(BANNER)
  await expect(page.getByRole('list', { name: 'Data states' }).locator('..')).toContainText(LEGEND)
  for (const x of await page.getByRole('status').allInnerTexts()) expect(x).not.toMatch(/paused|hasn't answered/i)
  await step('map with fresh delays')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await sheet.getByRole('tab', { name: /^Disruptions/ }).click()
  await expect(sheet.getByRole('tabpanel')).toContainText("Disruption messages come with Rejseplanen's live connection, which isn't connected yet.")
  await expect(sheet.getByRole('list', { name: 'From Mylder' })).toHaveCount(0)
  await expect(sheet.getByRole('tab', { name: /^Disruptions/ })).toHaveText(/^Disruptions$/)
  await step('disruptions: no quiet card while fresh')
  const bus = s.trips.find((t: any) => t.mode === 'bus' && t.state === 'estimated' && !t.cancelled && !t.waiting && t.delay >= 120)
  await page.goto(`/en?trip=${bus.key}`)
  const panel = page.getByRole('dialog', { name: / to / })
  await expect(panel).toContainText('Estimated')
  await expect(panel).toContainText(/\d+ min late/)
  await expect(panel).toContainText("Timetable and Rejseplanen's delays · updated")
  await expect(panel).not.toContainText('No signal')
  await step('estimated bus panel')
  await page.goto('/da')
  await expect(page.getByRole('status').first()).toContainText('Køreplan og forsinkelser: der er endnu ingen livepositioner, så hvert køretøj er placeret ud fra sin køreplan og, hvor Rejseplanen har sendt en, sin forsinkelse.')
  await step('danish banner')
}
