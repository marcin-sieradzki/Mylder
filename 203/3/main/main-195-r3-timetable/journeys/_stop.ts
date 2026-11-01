import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
// Regression (#204 merged): on the timetable source, tap Hovedbanegården, Tivoli -> each departure
// reads Timetable only, a countdown, a clock time with no ~, and "—"; the note and "Timetable · HH:MM:SS";
// the Metro-only Gammel Strand St. reads as its interval.
const W = {
  en: { state: 'Timetable only', note: "Countdowns use the timetable alone; live times aren't connected yet.", source: /Timetable\s·\s\d\d:\d\d:\d\d/, dep: 'Departures', arr: 'Arrivals', banned: /Rejseplanen|From the timetable|Timetable and positions/, every: /Every \d+(–\d+)? min/, metro: 'Metro: planned times' },
  da: { state: 'Kun køreplan', note: 'Nedtællinger bruger kun køreplanen; realtiden er ikke koblet på endnu.', source: /Køreplan\s·\s\d\d:\d\d:\d\d/, dep: 'Afgange', arr: 'Ankomster', banned: /Rejseplanen|Fra køreplanen|Køreplan og positioner/, every: /Hvert \d+\.(–\d+\.)? min/, metro: 'Metro: planlagte tider' },
}
export const stop = (lang: 'en' | 'da') => async ({ page, step, expect }: Journey) => {
  const w = W[lang]
  await page.goto(`/${lang}?map=17.00/55.67259/12.56661`)
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  await step('centred on Hovedbanegården, Tivoli')
  const vp = page.viewportSize()!
  const panel = page.getByRole('dialog', { name: 'Hovedbanegården, Tivoli' })
  await expect(async () => {
    await page.mouse.click(vp.width / 2, vp.height / 2)
    await expect(panel).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 30000 })
  await expect(page).toHaveURL(/[?&]stop=10842/)
  const list = panel.getByRole('list', { name: w.dep })
  await expect(list.getByRole('listitem').first()).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(800)
  await step('stop panel open')
  const text = await panel.innerText()
  dump('panel', text)
  const rows = await list.getByRole('listitem').allInnerTexts()
  dump('rows', rows)
  for (const r of rows) {
    expect(r).toContain(w.state)
    expect(r).toMatch(/(^|\s)\d\d:\d\d(\s|$)/)
    expect(r).not.toMatch(/~\s*\d\d:\d\d/)
    expect(r).toContain('—')
  }
  expect(text).toContain(w.note)
  expect(text).toMatch(w.source)
  expect(text).not.toMatch(w.banned)
  await panel.getByText(w.source).scrollIntoViewIfNeeded()
  await step('note and source line')
  await panel.getByRole('tab', { name: w.arr }).click()
  await expect(page).toHaveURL(/board=arrivals/)
  const arr = panel.getByRole('list', { name: w.arr })
  await expect(arr.getByRole('listitem').first()).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(800)
  await step('arrivals')
  const arows = await arr.getByRole('listitem').allInnerTexts()
  dump('arrivals', arows)
  for (const r of arows) { expect(r).toContain(w.state); expect(r).not.toMatch(/~\s*\d\d:\d\d/) }
  const atext = await panel.innerText()
  expect(atext).toMatch(w.source)
  expect(atext).not.toMatch(w.banned)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width)
  await page.goto(`/${lang}?stop=8603332`)
  const metro = page.getByRole('dialog', { name: 'Gammel Strand St.' })
  await expect(metro.getByRole('list', { name: w.dep }).getByRole('listitem').first()).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(800)
  await step('metro stop')
  const mtext = await metro.innerText()
  dump('metro', mtext)
  const mrows = await metro.getByRole('list', { name: w.dep }).getByRole('listitem').allInnerTexts()
  dump('metro-rows', mrows)
  expect(mrows.join('\n')).toMatch(/M3/)
  expect(mrows.join('\n')).toMatch(/M4/)
  for (const r of mrows) { expect(r).not.toMatch(/(^|\s)\d\d:\d\d(\s|$)/); expect(r).toMatch(w.every) }
  expect(mtext).toContain(w.metro)
  expect(mtext).toMatch(w.source)
  expect(mtext).toContain(w.note)
  expect(mtext).not.toMatch(w.banned)
}
