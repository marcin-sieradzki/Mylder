import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// trip-timetable and stop-timetable with --phone: the source line wraps inside the sheet, no sideways scroll.
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  const t = snap.trips.find((x: any) => x.mode === 'bus' && !x.waiting)
  await page.goto(`/en?trip=${t.key}`)
  const panel = page.getByRole('dialog', { name: / to / })
  await expect(panel).toContainText(/Timetable\s·\splaced \d\d:\d\d:\d\d/)
  const line = panel.locator('p').filter({ hasText: /Timetable\s·/ }).last()
  await line.scrollIntoViewIfNeeded()
  await step('bus by link, source line')
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(w[0]).toBeLessThanOrEqual(w[1])
  const b = (await panel.locator('p').filter({ hasText: /Timetable\s·/ }).last().boundingBox())!
  expect(b.x + b.width).toBeLessThanOrEqual(w[1])
  await page.goto('/en?stop=10842')
  const sp = page.getByRole('dialog', { name: 'Hovedbanegården, Tivoli' })
  await expect(sp).toContainText("Countdowns use the timetable alone; live times aren't connected yet.")
  const sl = sp.locator('p').filter({ hasText: /Timetable\s·/ }).last()
  await sl.scrollIntoViewIfNeeded()
  await step('stop source line')
  const b2 = (await sl.boundingBox())!
  expect(b2.x + b2.width).toBeLessThanOrEqual(w[1])
  const w2 = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(w2).toBeLessThanOrEqual(w[1])
}
