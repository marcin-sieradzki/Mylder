import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { cph, findDot, noSideways, openTripFromMap, snapshot } from './lib.ts'

const W = {
  en: { only: 'Timetable only', state: 'No live positions yet; placed from the timetable.', delay: 'Delay', last: 'Last seen', stops: 'Stops', follow: 'Follow', src: /Timetable\s·\splaced (\d\d:\d\d:\d\d)/, interval: 'Runs to an interval', old: /Rejseplanen|position \d|times from the timetable|From the timetable/ },
  da: { only: 'Kun køreplan', state: 'Ingen livepositioner endnu; placeret efter køreplanen.', delay: 'Forsinkelse', last: 'Sidst set', stops: 'Stop', follow: 'Følg', src: /Køreplan\s·\splaceret (\d\d:\d\d:\d\d)/, interval: 'Kører med fast interval', old: /Rejseplanen|position \d|tider fra køreplanen|Fra køreplanen/ },
}

export const vehicle = (lang: 'en' | 'da', mode: 'bus' | 'metro', opts: { follow?: boolean } = {}) =>
  async ({ page, step, expect }: Journey) => {
    const w = W[lang]
    const log = (s: string) => console.log(s)
    const phone = page.viewportSize()!.width < 600
    const key = await openTripFromMap(page, expect, lang, mode, log)
    const panel = page.getByRole('dialog', { name: lang === 'en' ? / to / : / mod | til / }).last()
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('list', { name: w.stops })).toBeVisible({ timeout: 20000 })
    await step(`${mode} opened from the map`)
    const text = await panel.innerText()
    const snap = await snapshot(page)
    log(`panel text:\n${text}\n---\nsnapshot fetched ${cph(snap.fetched)}`)
    expect(key.startsWith(mode + '.')).toBe(true)
    if (w.only) expect(text).toContain(w.only)
    if (mode !== 'metro') expect(text).toContain(w.state)
    const stops = await panel.getByRole('list', { name: w.stops }).getByRole('listitem').allInnerTexts()
    log(`stops (${stops.length}): ${stops.slice(0, 5).join(' | ')}`)
    if (mode === 'metro') {
      expect(text).toMatch(new RegExp(`${w.delay}\\s*${w.interval}`))
      for (const s of stops) expect(s).not.toMatch(/\d\d:\d\d/)
    } else {
      expect(text).toMatch(new RegExp(`${w.delay}\\s*—`))
      expect(text).toMatch(new RegExp(`${w.last}\\s*—`))
      expect(stops.length).toBeGreaterThan(0)
      for (const s of stops) {
        expect(s).toMatch(/\d\d:\d\d/)
        expect(s).not.toMatch(/~\s*\d\d:\d\d/)
        expect(s).not.toMatch(/[+−-]\s?\d+\b(?!:)/)
      }
    }
    const src = text.match(w.src)
    log(`source line match: ${src?.[0]}`)
    expect(src).toBeTruthy()
    expect(text).not.toMatch(w.old)
    if (phone) {
      const s = await noSideways(page)
      log(`sideways: ${JSON.stringify(s)}`)
      expect(s.pageScroll).toBeLessThanOrEqual(s.inner)
      const line = panel.getByText(w.src).last()
      await line.scrollIntoViewIfNeeded()
      const box = (await line.boundingBox())!
      log(`source line box ${JSON.stringify(box)}`)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
      await step('source line in the sheet')
    }
    if (opts.follow) {
      const before = page.url()
      await panel.getByRole('button', { name: w.follow }).click()
      await page.waitForTimeout(3000)
      await step('following')
      const card1 = await findDot(page)
      log(`card at centre on follow: ${card1?.text}`)
      await page.mouse.move(5, page.viewportSize()!.height - 5)
      await page.waitForTimeout(15000)
      await step('following, 15 s later')
      const after = page.url()
      const card2 = await findDot(page)
      log(`card at centre 15 s later: ${card2?.text}\nurl before ${before}\nurl after ${after}`)
      expect(card1?.text).toContain(key.split('.')[1])
      expect(card2?.text).toContain(key.split('.')[1])
      expect(card2?.text).toContain(w.only)
    }
  }
