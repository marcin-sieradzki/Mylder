import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { noSideways } from './lib.ts'

const W = {
  en: { dep: 'Departures', arr: 'Arrivals', note: "Countdowns use the timetable alone; live times aren't connected yet.", src: /Timetable\s·\s(\d\d:\d\d:\d\d)/, old: /Rejseplanen|From the timetable|Timetable and positions/, every: /Every \d+(–\d+)? min|Every \d+ to \d+ min/, metroNote: 'Metro: planned times', only: 'Timetable only' },
  da: { dep: 'Afgange', arr: 'Ankomster', note: 'Nedtællinger bruger kun køreplanen; realtiden er ikke koblet på endnu.', src: /Køreplan\s·\s(\d\d:\d\d:\d\d)/, old: /Rejseplanen|Fra køreplanen|Køreplan og positioner/, every: /Hver \d+|Hvert? \d+/, metroNote: 'Metro: planlagte tider', only: '' },
}

const checkBoard = async (page: any, expect: any, panel: any, w: any, list: string, log: (s: string) => void) => {
  const items = panel.getByRole('list', { name: list }).getByRole('listitem')
  await expect(items.first()).toBeVisible({ timeout: 20000 })
  const rows: string[] = await items.allInnerTexts()
  const text: string = await panel.innerText()
  log(`${list} rows (${rows.length}):\n${rows.slice(0, 8).map((r) => r.replace(/\n/g, ' / ')).join('\n')}\n--- panel foot: ${text.split('\n').slice(-5).join(' / ')}`)
  for (const r of rows) {
    if (w.every.test(r)) continue
    if (w.only) expect(r).toContain(w.only)
    expect(r).toMatch(/\d\d:\d\d/)
    expect(r).not.toMatch(/~\s*\d\d:\d\d/)
    expect(r).toContain('—')
    expect(r).not.toMatch(/\s[+−]\d+\b/)
  }
  expect(text).toContain(w.note)
  const src = text.match(w.src)
  log(`source line: ${src?.[0]}`)
  expect(src).toBeTruthy()
  expect(text).not.toMatch(w.old)
  return rows
}

// A bus stop from a tap on its marker.
export const busStop = (lang: 'en' | 'da') =>
  async ({ page, step, expect }: Journey) => {
    const w = W[lang]
    const log = (s: string) => console.log(s)
    const phone = page.viewportSize()!.width < 600
    await page.goto(`/${lang}?map=17.00/55.67259/12.56661`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 20000 })
    await step('map at Hovedbanegården, Tivoli')
    const panel = page.getByRole('dialog', { name: 'Hovedbanegården, Tivoli' })
    await expect(async () => {
      if (/[?&]trip=/.test(page.url())) await page.goto(`/${lang}?map=17.00/55.67259/12.56661`)
      const vp = page.viewportSize()!
      await page.mouse.click(vp.width / 2, vp.height / 2)
      await expect(panel).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 60000 })
    await expect(page).toHaveURL(/[?&]stop=10842/)
    await step('stop opened from its marker')
    await checkBoard(page, expect, panel, w, w.dep, log)
    if (phone) {
      const s = await noSideways(page)
      log(`sideways: ${JSON.stringify(s)}`)
      expect(s.pageScroll).toBeLessThanOrEqual(s.inner)
      const line = panel.getByText(w.src).last()
      await line.scrollIntoViewIfNeeded()
      const box = (await line.boundingBox())!
      const note = (await panel.getByText(w.note).last().boundingBox())!
      log(`source line box ${JSON.stringify(box)} note box ${JSON.stringify(note)}`)
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
      expect(note.x + note.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    }
    await step('departures, note and source line')
    await panel.getByRole('tab', { name: w.arr }).click()
    await expect(page).toHaveURL(/board=arrivals/)
    await checkBoard(page, expect, panel, w, w.arr, log)
    await step('arrivals, note and source line')
  }

// Gammel Strand St., the Metro alone, by its link.
export const metroStop = (lang: 'en' | 'da') =>
  async ({ page, step, expect }: Journey) => {
    const w = W[lang]
    const log = (s: string) => console.log(s)
    const phone = page.viewportSize()!.width < 600
    const answers: string[] = []
    page.on('response', async (r) => {
      if (/\/api\/stops\/8603332/.test(r.url())) answers.push(`${r.url()} ${await r.text().catch(() => '')}`)
    })
    await page.goto(`/${lang}?stop=8603332`)
    const panel = page.getByRole('dialog', { name: 'Gammel Strand St.' })
    await expect(panel).toBeVisible({ timeout: 20000 })
    const items = panel.getByRole('list', { name: w.dep }).getByRole('listitem')
    await expect(items.first()).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(2000)
    await step('Gammel Strand St. departures')
    const rows = await items.allInnerTexts()
    const text = await panel.innerText()
    log(`rows (${rows.length}):\n${rows.map((r) => r.replace(/\n/g, ' / ')).join('\n')}\n--- panel:\n${text}`)
    const dupes = rows.filter((r, i) => rows.indexOf(r) !== i)
    log(`identical rows: ${JSON.stringify(dupes)}`)
    log(`answers: ${answers.join('\n').slice(0, 3000)}`)
    expect(rows.some((r) => /M3/.test(r) && w.every.test(r))).toBe(true)
    expect(rows.some((r) => /M4/.test(r) && w.every.test(r))).toBe(true)
    for (const r of rows) expect(r).not.toMatch(/\d\d:\d\d/)
    expect(text).toContain(w.metroNote)
    expect(text).toContain(w.note)
    expect(text).toMatch(w.src)
    expect(text).not.toMatch(w.old)
    if (phone) {
      const s = await noSideways(page)
      log(`sideways: ${JSON.stringify(s)}`)
      expect(s.pageScroll).toBeLessThanOrEqual(s.inner)
      const line = panel.getByText(w.src).last()
      await line.scrollIntoViewIfNeeded()
      const box = (await line.boundingBox())!
      log(`source line box ${JSON.stringify(box)}`)
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
      await step('source line in the sheet')
    }
  }
