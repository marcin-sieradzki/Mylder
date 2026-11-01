import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
// Regression (#204 merged): on the timetable source, tap a bus underway -> its panel reads as the
// timetable's: Timetable only, "No live positions yet; placed from the timetable.", Delay and Last
// seen "—", stop times with no ~ or +N, and "Timetable · placed HH:MM:SS".
const W = {
  en: { state: 'Timetable only', note: 'No live positions yet; placed from the timetable.', source: /Timetable\s·\splaced\s\d\d:\d\d:\d\d/, delay: 'Delay', last: 'Last seen', stops: 'Stops', pause: 'Pause', banned: /Rejseplanen|position ·|times from the timetable|From the timetable/ },
  da: { state: 'Kun køreplan', note: 'Ingen livepositioner endnu; placeret efter køreplanen.', source: /Køreplan\s·\splaceret\s\d\d:\d\d:\d\d/, delay: 'Forsinkelse', last: 'Sidst set', stops: 'Stop', pause: 'Pause', banned: /Rejseplanen|position ·|tider fra køreplanen|Fra køreplanen/ },
}
export const vehicle = (lang: 'en' | 'da') => async ({ page, step, expect }: Journey) => {
  const w = W[lang]
  const snap = await (await page.request.get('/api/snapshot')).json()
  const buses = snap.trips.filter((t: { mode: string; waiting?: true; cancelled?: true }) => t.mode === 'bus' && !t.waiting && !t.cancelled)
  if (!buses.length) throw new Error('Precondition not reached: no bus underway on the timetable now')
  const bus = buses[Math.floor(buses.length / 2)]
  dump('bus', { key: bus.key, line: bus.line, headsign: bus.headsign, state: bus.state, position: bus.position })
  const [lat, lon] = bus.position
  await page.goto(`/${lang}?map=14.00/${lat.toFixed(5)}/${lon.toFixed(5)}`)
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  await page.getByRole('button', { name: w.pause }).click().catch(() => {})
  await step('centred on a bus')
  const vp = page.viewportSize()!
  const cx = vp.width / 2, cy = vp.height / 2
  const pts: [number, number][] = [[cx, cy]]
  for (let r = 8; r <= 320; r += 10) for (let a = 0; a < 360; a += 15) pts.push([cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)])
  const panel = page.getByRole('dialog', { name: /\S/ }).filter({ has: page.getByRole('list', { name: w.stops }) })
  // The dot has moved on from the snapshot's position: find it by its hover card, nearest first, then tap it.
  let hit: [number, number] | null = null
  for (const [x, y] of pts) {
    await page.mouse.move(x, y)
    if (await page.getByRole('tooltip').isVisible().catch(() => false) && /^(Bus|Bus) /.test(await page.getByRole('tooltip').innerText().catch(() => ''))) { hit = [x, y]; break }
  }
  if (!hit) throw new Error('no bus dot within 320 px of the bus\'s snapshot position')
  dump('card', await page.getByRole('tooltip').innerText())
  await step('hover card')
  await page.mouse.click(hit[0], hit[1])
  await expect(page).toHaveURL(/[?&]trip=/, { timeout: 10000 })
  await expect(panel).toBeVisible({ timeout: 10000 })
  await expect(panel.getByRole('list', { name: w.stops }).getByRole('listitem').first()).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1000)
  await step('vehicle panel open')
  const text = await panel.innerText()
  dump('panel', text)
  dump('url', page.url())
  const stops = await panel.getByRole('list', { name: w.stops }).getByRole('listitem').allInnerTexts()
  dump('stops', stops)
  expect(text).toContain(w.state)
  expect(text).toContain(w.note)
  expect(text).toMatch(w.source)
  expect(text).toMatch(new RegExp(`${w.delay}\\s*—`))
  expect(text).toMatch(new RegExp(`${w.last}\\s*—`))
  expect(text).not.toMatch(w.banned)
  for (const s of stops) {
    expect(s).not.toMatch(/~\s*\d\d:\d\d/)
    expect(s).not.toMatch(/[+−-]\d+(\s|$)/)
  }
  const vw = vp.width
  const sw = await page.evaluate(() => document.documentElement.scrollWidth)
  dump('widths', { vw, sw })
  expect(sw).toBeLessThanOrEqual(vw)
  await panel.getByText(w.source).scrollIntoViewIfNeeded()
  await step('source line')
}
