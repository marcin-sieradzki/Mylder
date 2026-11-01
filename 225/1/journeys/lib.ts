import type { Journey } from '/home/user/mylder-verify/214-branch/.claude/skills/verify-mylder/scripts/drive.ts'

type Lang = 'en' | 'da'
const CANCEL_AT = Date.parse('2026-10-31T08:21:15Z')
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const srcRe = (src: string) => new RegExp(src.trim().split(/\s+/).map(esc).join('\\s*') + '\\s*(\\d\\d:\\d\\d:\\d\\d)')
const clock = (ms: number, seconds = false) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}), hourCycle: 'h23',
  }).format(new Date(ms))

const W = {
  en: {
    source: "Timetable and Rejseplanen's delays · updated ",
    late: (n: number) => `${n} min late`, early: (n: number) => `${n} min early`,
    cancelled: 'Cancelled', expected: 'Expected ', departures: 'Departures', arrivals: 'Arrivals',
    note: "Countdowns use the timetable, moved by Rejseplanen's delay where a trip has one; the rest use the timetable alone.",
    stops: 'Stops', estimated: 'Estimated', ttOnly: 'Timetable only', unknown: 'Delay unknown',
    metro: 'Metro: planned times', every: /Every \d+ min/, nextStop: 'Next stop',
    banned: [/placed/, /No live positions yet/, /live times aren't connected yet/],
  },
  da: {
    source: 'Køreplan og Rejseplanens forsinkelser · opdateret ',
    late: (n: number) => `${n} min forsinket`, early: (n: number) => `${n} min før tid`,
    cancelled: 'Aflyst', expected: '', departures: 'Afgange', arrivals: 'Ankomster',
    note: 'Nedtællinger bruger køreplanen, rykket med Rejseplanens forsinkelse, hvor en tur har en; resten bruger køreplanen alene.',
    stops: '', estimated: '', ttOnly: '', unknown: '', metro: '', every: /Hvert \d+\. min/, nextStop: '',
    banned: [/placeret/, /realtiden er ikke koblet på endnu/],
  },
}

async function noSidewaysScroll({ page, expect }: Journey, panel: import('@playwright/test').Locator, sourceText: string) {
  const vw = page.viewportSize()!.width
  if (vw > 600) return
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw[0], 'page scrolls sideways').toBeLessThanOrEqual(sw[1])
  const line = panel.getByText(sourceText, { exact: false }).last()
  await line.scrollIntoViewIfNeeded()
  const box = (await line.boundingBox())!
  const pbox = (await panel.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(pbox.x - 1)
  expect(box.x + box.width, 'source line runs past the sheet').toBeLessThanOrEqual(Math.min(vw, pbox.x + pbox.width) + 1)
  const sideways = await line.evaluate((el) => {
    let n: HTMLElement | null = el as HTMLElement
    while (n) { if (n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX !== 'visible' && getComputedStyle(n).overflowX !== 'hidden') return n.className; n = n.parentElement }
    return null
  })
  expect(sideways, 'an ancestor of the source line scrolls sideways').toBeNull()
}

/** Opens a late (or early) estimated bus by its shared link and checks its delay, ~ times and source line. */
export async function vehicleDelay(j: Journey, lang: Lang, sign: 'late' | 'early') {
  const { page, step, expect } = j
  const w = W[lang]
  const snap = await (await page.request.get('/api/snapshot')).json()
  const candidates = snap.trips.filter((t: any) => t.mode === 'bus' && t.state === 'estimated' && !t.cancelled && !t.waiting &&
    (sign === 'late' ? t.delay >= 120 : t.delay <= -120))
  if (!candidates.length) throw new Error(`precondition: no ${sign} estimated bus in /api/snapshot`)
  // Precondition search: the first candidate whose next stop's delay is a minute or more in the asked direction.
  let chosen: any, fresh: any, panel: any, N = 0, nextName = '', delayText = ''
  await page.goto(`/${lang}`)
  await expect(page.getByRole('banner')).toBeVisible()
  await step('map before opening the trip')
  for (const t of candidates.slice(0, 8)) {
    await page.goto(`/${lang}?trip=${t.key}`)
    const p = page.getByRole('dialog', { name: new RegExp(`(to|mod) ${t.headsign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
    await expect(p).toBeVisible()
    await expect(p.getByText(w.source.trim().split(' ·')[0], { exact: false })).toBeVisible()
    const f = await (await page.request.get(`/api/trips/${encodeURIComponent(t.key)}`)).json()
    const nn = (await p.getByRole('definition').nth(2).textContent())!.trim()
    const call = f.calls.find((c: any) => c.name === nn && (c.expectedDeparture ?? c.expectedArrival) >= f.fetched - 60000)
    if (!call || call.expectedDeparture == null && call.expectedArrival == null) continue
    const n = Math.round(((call.expectedDeparture ?? call.expectedArrival) - (call.departure ?? call.arrival)) / 60000)
    if (sign === 'late' ? n >= 1 : n <= -1) { chosen = t; fresh = f; panel = p; N = n; nextName = nn; break }
  }
  if (!chosen) throw new Error(`precondition: no ${sign} bus whose next stop is a minute or more ${sign}`)
  console.log('chosen', chosen.key, chosen.headsign, chosen.delay)
  expect(new URL(page.url()).searchParams.get('trip')).toBe(chosen.key)
  await step(`${sign} trip opened`)
  const text = (await panel.textContent())!
  const items = panel.getByRole('list').last().getByRole('listitem')
  const n = await items.count()
  expect(n, 'one stop row per call').toBe(fresh.calls.length)
  let checked = 0
  for (let i = 0; i < n; i++) {
    const c = fresh.calls[i]
    const planned = c.departure ?? c.arrival, exp = c.expectedDeparture ?? c.expectedArrival
    const t = (await items.nth(i).textContent())!
    expect(t).toContain(c.name)
    expect(t).toContain(clock(planned))
    if (exp != null && Math.abs(exp - planned) >= 60000) {
      expect(t, `stop ${c.name} lacks ~expected`).toContain(`~${clock(exp)}`)
      if (lang === 'en') expect(t).toContain(`Expected ${clock(exp)}`)
      checked++
    }
  }
  expect(checked, 'stops with an expected time a minute or more off').toBeGreaterThan(0)
  const delayText2 = (await panel.getByRole('definition').first().textContent())!
  delayText = delayText2
  console.log('next', nextName, 'N', N, 'fact', delayText)
  if (sign === 'late') { expect(delayText).toContain(`+${N}`); expect(delayText).toContain(w.late(N)) }
  else { expect(delayText).toContain(`−${-N}`); expect(delayText).toContain(w.early(-N)) }
  if (lang === 'en') {
    expect(text).toContain('Estimated')
    expect(text).toContain(`Estimated from the timetable and a delay of ${sign === 'late' ? '+' : '−'}${Math.abs(N)} min`)
  }
  const updated = chosen.updated as number
  const m = text.match(srcRe(w.source))
  expect(m, 'source line').not.toBeNull()
  const shown = m![1]
  const ok = [chosen.updated, fresh.source?.delaysUpdated, snap.trips.find((t: any) => t.key === chosen.key)?.updated].filter(Boolean).map((x: number) => clock(x, true))
  console.log('source time', shown, 'expected one of', ok, 'updated', clock(updated, true))
  // The trip's update can move on between our snapshot and the page's; it must be a real update time not after the page's answer.
  const ms = Date.parse(`2026-10-31T${shown}+01:00`)
  expect(ms).toBeGreaterThanOrEqual(updated - 1000)
  expect(ms).toBeLessThanOrEqual(fresh.fetched + 1000)
  for (const b of w.banned) expect(text).not.toMatch(b)
  await panel.getByText(w.source.split(' ·')[0], { exact: false }).last().scrollIntoViewIfNeeded()
  await step('source line in view')
  await noSidewaysScroll(j, panel, w.source.split(' ·')[0])
}

export async function waitForCancellation({ page, expect }: Journey) {
  await expect.poll(async () => (await (await page.request.get('/api/snapshot')).json()).fetched, { timeout: 30 * 60_000, intervals: [10_000] }).toBeGreaterThan(CANCEL_AT)
}

/** Bus 68 to Lyngby St. skips Otto Mønsteds Plads from 09:21:15 and stays on the map. */
export async function vehicleCancelledCall(j: Journey, lang: Lang) {
  const { page, step, expect } = j
  const w = W[lang]
  await waitForCancellation(j)
  const key = 'bus.68.bb4e5908a5.20261031.0916'
  const snap = await (await page.request.get('/api/snapshot')).json()
  const trip = snap.trips.find((t: any) => t.key === key)
  expect(trip, 'bus 68 of 09:16 is in the snapshot (on the map)').toBeTruthy()
  expect(trip.cancelled ?? false).toBe(false)
  expect(trip.position, 'bus 68 of 09:16 has a position').toBeTruthy()
  const panel = page.getByRole('dialog', { name: /68 (to|mod) Lyngby St\./ })
  const phone = page.viewportSize()!.width < 600
  if (phone) {
    // No hover on a phone: open it by its shared link; the snapshot above shows it drawn.
    await page.goto(`/${lang}?trip=${key}`)
    await expect(panel).toBeVisible()
  } else {
    // From its dot: centre the map on it, pause, and hover outwards until bus 68's card shows, then tap.
    await expect(async () => {
      const s = await (await page.request.get('/api/snapshot')).json()
      const t = s.trips.find((x: any) => x.key === key)
      await page.goto(`/${lang}?map=16.00/${t.position[0]}/${t.position[1]}`)
      await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 15000 })
      await page.waitForTimeout(1000)
      await page.getByRole('button', { name: lang === 'en' ? 'Pause' : /Pause/ }).click().catch(() => {})
      await page.waitForTimeout(500)
      const vp = page.viewportSize()!
      let hit = false
      outer: for (let r = 0; r <= 240; r += 6)
        for (let a = 0; a < 360; a += r === 0 ? 360 : Math.max(6, Math.round(360 / (r / 3)))) {
          const x = vp.width / 2 + r * Math.cos((a * Math.PI) / 180), y = vp.height / 2 + r * Math.sin((a * Math.PI) / 180)
          await page.mouse.move(x, y)
          const tip = page.getByRole('tooltip')
          if (await tip.isVisible().catch(() => false)) {
            const text = await tip.innerText().catch(() => '')
            if (/68/.test(text) && /Lyngby/.test(text)) { await step('bus 68 card on hover'); await page.mouse.click(x, y); hit = true; break outer }
          }
        }
      expect(hit, 'bus 68 card found').toBe(true)
      await expect(panel).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 180_000 })
  }
  expect(new URL(page.url()).searchParams.get('trip')).toBe(key)
  await step(phone ? 'bus 68 opened by link' : 'bus 68 opened from its dot')
  const item = panel.getByRole('listitem').filter({ hasText: 'Otto Mønsteds Plads (Rysensteensgade)' })
  await expect(item).toHaveCount(1)
  await item.scrollIntoViewIfNeeded()
  await expect(item).toContainText(w.cancelled)
  await expect(item).toHaveAttribute('data-cancelled', /.*/)
  await step('skipped stop reads Cancelled')
  const all = panel.getByRole('list').last().getByRole('listitem')
  const n = await all.count()
  let cancelledCount = 0
  for (let i = 0; i < n; i++) {
    const it = all.nth(i)
    const t = (await it.textContent())!
    const c = await it.getAttribute('data-cancelled')
    if (c !== null || t.includes(w.cancelled)) { cancelledCount++; expect(t).toContain('Otto Mønsteds Plads') }
  }
  expect(cancelledCount).toBe(1)
  const vtext = (await panel.textContent())!
  expect(vtext, "the vehicle's source line names Rejseplanen's delays").toMatch(srcRe(w.source))
  for (const b of w.banned) expect(vtext).not.toMatch(b)
  await noSidewaysScroll(j, panel, w.source.split(' ·')[0])
}


async function checkBoard(j: Journey, lang: Lang, panel: import('@playwright/test').Locator, listName: string, api: any, url: string) {
  const api2 = await (await j.page.request.get(url)).json()
  const { expect } = j
  const w = W[lang]
  const list = panel.getByRole('list', { name: listName })
  await expect(list.getByRole('listitem').first()).toBeVisible()
  const snapRows = await list.evaluate((el) => [...el.querySelectorAll(':scope > li')].map((li) => {
    const times = li.querySelectorAll('time')
    return {
      text: li.textContent ?? '',
      time: times.length ? times[times.length - 1].textContent ?? '' : null,
      badge: li.querySelector('.pn-LineBadge')?.textContent?.trim() ?? '',
      variant: li.querySelector('[data-variant]')?.getAttribute('data-variant') ?? null,
    }
  }))
  const n = snapRows.length
  const items = [...(api.departures ?? api.arrivals), ...(api2.departures ?? api2.arrivals)]
  let est = 0, tt = 0, metro = 0, moved = 0
  for (let i = 0; i < n; i++) {
    const t = snapRows[i].text
    const isMetro = snapRows[i].time === null
    if (isMetro) { expect(t).toMatch(w.every); if (lang === 'en') expect(t).toContain(w.metro); metro++; continue }
    const time = snapRows[i].time!
    const hasTilde = time.trim().startsWith('~')
    const line = snapRows[i].badge
    const hhmm = time.replace('~', '').trim()
    const place = (d: any) => (d.origin ?? d.headsign) as string
    const same = items.filter((d: any) => d.line === line && t.includes(place(d)))
    const status = snapRows[i].variant
    if (status === 'estimated') {
      est++
      expect(hasTilde, `estimated row ${line} ${t} lacks ~`).toBe(true)
      if (lang === 'en') { expect(t).toContain('Estimated'); expect(t).not.toContain(w.unknown) }
      const m = same.filter((d: any) => d.state === 'estimated' && d.expected != null && clock(d.expected) === hhmm)
      expect(m.length, `no estimated ${line} ${t} at ~${hhmm} in the stop's answer`).toBeGreaterThan(0)
      const d = m[0]
      if (Math.abs(d.expected - d.scheduled) >= 60000) { expect(t).toContain(clock(d.scheduled)); moved++ }
    } else if (status === 'timetable-only') {
      tt++
      expect(hasTilde, `timetable-only row ${line} ${t} has ~ before its time`).toBe(false)
      expect(t).toContain('—')
      if (lang === 'en') { expect(t).toContain('Timetable only'); expect(t).toContain('Delay unknown') }
      const m = same.filter((d: any) => d.state === 'timetable-only' && clock(d.scheduled) === hhmm)
      expect(m.length, `no timetable-only ${line} ${t} at ${hhmm} in the stop's answer`).toBeGreaterThan(0)
    }
  }
  console.log(listName, { est, tt, metro, moved, n })
  expect(est, 'no Estimated row').toBeGreaterThan(0)
  expect(tt, 'no Timetable only row').toBeGreaterThan(0)
  const text = (await panel.textContent())!
  expect(text).toContain(w.note)
  for (const b of w.banned) expect(text).not.toMatch(b)
  const m = text.match(srcRe(w.source))
  expect(m, 'source line').not.toBeNull()
  return { est, tt, metro, moved, shown: m![1] }
}

/** Nørreport St.: ~ for updated trips, — for the rest, the Metro's interval, and the delays' source line, both tabs. */
export async function stopDelays(j: Journey, lang: Lang) {
  const { page, step, expect } = j
  const w = W[lang]
  const before = (await (await page.request.get('/api/snapshot')).json()).updates.lastMessage
  const api0 = await (await page.request.get('/api/stops/6584')).json()
  const apiA0 = await (await page.request.get('/api/stops/6584/arrivals')).json()
  await page.goto(`/${lang}?stop=6584`)
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel.getByRole('list', { name: w.departures })).toBeVisible()
  await expect(panel.getByText(w.source.split(' ·')[0], { exact: false })).toBeVisible()
  const api = await (await page.request.get('/api/stops/6584')).json()
  const after = Math.max((await (await page.request.get('/api/snapshot')).json()).updates.lastMessage, api.source?.delaysUpdated ?? 0)
  await step('Nørreport St. departures')
  const d = await checkBoard(j, lang, panel, w.departures, api0, '/api/stops/6584')
  expect(d.metro, 'Metro rows M1 and M2 as an interval').toBeGreaterThanOrEqual(2)
  const ms = Date.parse(`2026-10-31T${d.shown}+01:00`)
  console.log('source', d.shown, clock(before, true), clock(after, true))
  expect(ms).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000 - 60_000)
  expect(ms).toBeLessThanOrEqual(after + 1000)
  await panel.getByText(w.source.split(' ·')[0], { exact: false }).last().scrollIntoViewIfNeeded()
  await step('departures source line')
  await noSidewaysScroll(j, panel, w.source.split(' ·')[0])
  await panel.getByRole('tab', { name: w.arrivals }).click()
  await expect(page).toHaveURL(/board=arrivals/)
  await expect(panel.getByRole('list', { name: w.arrivals })).toBeVisible()
  await step('Nørreport St. arrivals')
  await checkBoard(j, lang, panel, w.arrivals, apiA0, '/api/stops/6584/arrivals')
  await noSidewaysScroll(j, panel, w.source.split(' ·')[0])
}

/** Fændediget's cancelled 102A, and Otto Mønsteds Plads's skipped 68s, read Cancelled. */
export async function stopCancelled(j: Journey, lang: Lang) {
  const { page, step, expect } = j
  const w = W[lang]
  await waitForCancellation(j)
  const snap = await (await page.request.get('/api/snapshot')).json()
  const drawn102A = snap.trips.filter((t: any) => t.line === '102A' && /\.0922$/.test(t.key) && !t.cancelled && t.position)
  expect(drawn102A, 'the cancelled 102A of 09:22 is still drawn').toHaveLength(0)
  await page.goto(`/${lang}?stop=5344`)
  const f = page.getByRole('dialog', { name: 'Fændediget' })
  const fl = f.getByRole('list', { name: w.departures })
  await expect(fl).toBeVisible()
  const row = fl.getByRole('listitem').filter({ hasText: '102A' }).filter({ hasText: 'Køge St.' }).filter({ hasText: '09:40' })
  await expect(row).toHaveCount(1)
  await row.scrollIntoViewIfNeeded()
  await expect(row).toContainText(w.cancelled)
  await step('Fændediget 102A Cancelled')
  const ftext = (await f.textContent())!
  expect(ftext, "Fændediget's source line names Rejseplanen's delays").toMatch(srcRe(w.source))
  expect(ftext).toContain(w.note)
  await noSidewaysScroll(j, f, w.source.split(' ·')[0])
  await page.goto(`/${lang}?stop=30090`)
  const o = page.getByRole('dialog', { name: /Otto Mønsteds Plads/ })
  const ol = o.getByRole('list', { name: w.departures })
  await expect(ol).toBeVisible()
  const r1 = ol.getByRole('listitem').filter({ hasText: /^68/ }).filter({ hasText: 'Lyngby St. (Jernbanepladsen)' }).filter({ hasText: '09:32' })
  const r2 = ol.getByRole('listitem').filter({ hasText: /^68/ }).filter({ hasText: 'Kigkurren (Sturlasgade)' }).filter({ hasText: '09:38' })
  await expect(r1).toHaveCount(1)
  await expect(r2).toHaveCount(1)
  await expect(r1).toContainText(w.cancelled)
  await expect(r2).toContainText(w.cancelled)
  await r1.scrollIntoViewIfNeeded()
  await step('Otto Mønsteds Plads 68s Cancelled')
  const otext = (await o.textContent())!
  expect(otext, "Otto Mønsteds Plads's source line names Rejseplanen's delays").toMatch(srcRe(w.source))
  const others = ol.getByRole('listitem').filter({ hasText: w.cancelled })
  console.log('cancelled rows at Otto Mønsteds Plads', await others.count())
}
