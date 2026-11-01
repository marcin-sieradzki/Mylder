import type { Journey } from '/home/user/mylder-verify/215-branch/.claude/skills/verify-mylder/scripts/drive.ts'
export type { Journey }
type Lang = 'en' | 'da'
type Loc = import('@playwright/test').Locator
export const snapshot = async (page: Journey['page']) => (await page.request.get('/api/snapshot')).json()
const clock = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(ms))

const W = {
  en: {
    sheet: 'Overview', avg: 'Average delay', avgCaption: 'min, vehicles with a known delay, Metro left out',
    withDelays: 'With delays, by mode', reportingLive: 'Reporting live, by mode', reported: 'Reported this minute',
    noLive: 'No live positions yet; placed from the timetable', metroLine: 'No realtime from the Metro; placed from the timetable',
    lightRailLine: 'Rejseplanen sends no delays for this mode; placed from the timetable',
    modes: { bus: 'Bus', metro: 'Metro', 's-tog': 'S-tog', train: 'Train', 'light-rail': 'Light rail' } as Record<string, string>,
    operator: { bus: 'Movia', 's-tog': 'DSB', train: 'DSB' } as Record<string, string>,
    about: 'About Mylder', delaysFact: 'Delays', delaysValue: "Rejseplanen's SIRI-ET, updated ",
    credits: 'Delays and cancellations: Rejsekort & Rejseplan A/S, through Rejseplanen\'s SIRI-ET.',
    cornerCredit: 'Delays: Rejsekort & Rejseplan A/S', unknown: 'Unknown', decimal: '.',
  },
  da: {
    sheet: 'Overblik', avg: 'Gennemsnitlig forsinkelse', avgCaption: 'min, køretøjer med kendt forsinkelse, Metro udeladt',
    withDelays: 'Med forsinkelser, efter transportform', reportingLive: 'Melder live, efter transportform', reported: 'Meldt i dette minut',
    noLive: 'Ingen livepositioner endnu; placeret efter køreplanen', metroLine: 'Ingen realtid fra Metroen; placeret efter køreplanen',
    lightRailLine: 'Rejseplanen sender ingen forsinkelser for denne transportform; placeret efter køreplanen',
    modes: { bus: 'Bus', metro: 'Metro', 's-tog': 'S-tog', train: 'Tog', 'light-rail': 'Letbane' } as Record<string, string>,
    operator: { bus: 'Movia', 's-tog': 'DSB', train: 'DSB' } as Record<string, string>,
    about: 'Om Mylder', delaysFact: 'Forsinkelser', delaysValue: 'Rejseplanens SIRI-ET, opdateret ',
    credits: 'Forsinkelser og aflysninger: Rejsekort & Rejseplan A/S, via Rejseplanens SIRI-ET.',
    cornerCredit: 'Forsinkelser: Rejsekort & Rejseplan A/S', unknown: 'Ukendt', decimal: ',',
  },
}

/** Waits until the SIRI-ET table has filled for a minute: fresh updates on the snapshot. */
export async function tableFilled({ page, expect }: Journey) {
  await expect.poll(async () => { const s = await snapshot(page); return s.updates?.fresh === true && s.trips.some((t: any) => t.state === 'estimated') }, { timeout: 120_000, intervals: [5000] }).toBe(true)
}

async function noSideways(page: Journey['page'], expect: Journey['expect'], els: Loc[], container: Loc) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw, 'page scrolls sideways').toBeLessThanOrEqual(cw)
  const cb = (await container.boundingBox())!
  const vw = page.viewportSize()!.width
  for (const el of els) {
    await el.scrollIntoViewIfNeeded()
    const b = (await el.boundingBox())!
    expect(b.x, `${await el.innerText()} starts left of the sheet`).toBeGreaterThanOrEqual(Math.max(0, cb.x) - 1)
    expect(b.x + b.width, `${await el.innerText()} runs past the sheet`).toBeLessThanOrEqual(Math.min(vw, cb.x + cb.width) + 1)
  }
}

/** City pulse with SIRI-ET's delays: the average delay, a share per mode, and the position meters still without live positions. */
export async function pulse(j: Journey, lang: Lang) {
  const { page, step, expect } = j
  const w = W[lang]
  const phone = page.viewportSize()!.width < 600
  await tableFilled(j)
  await page.goto(`/${lang}`)
  const sheet = page.getByRole('dialog', { name: w.sheet })
  const avg = sheet.getByRole('group', { name: w.avg })
  await expect(avg).toBeVisible({ timeout: 30_000 })
  await step('city pulse opened')
  // the average delay: signed minutes with one decimal, the mean of the Estimated non-Metro trips' delays
  let shown = '', want = 0
  await expect.poll(async () => {
    const s = await snapshot(page)
    const est = s.trips.filter((t: any) => t.state === 'estimated' && !t.cancelled && t.mode !== 'metro' && typeof t.delay === 'number')
    want = est.reduce((a: number, t: any) => a + t.delay, 0) / est.length / 60
    shown = (await avg.innerText())
    const m = shown.match(/([+−-])(\d+)[.,](\d)\b/)
    if (!m) return `no signed one-decimal figure in ${JSON.stringify(shown)}`
    const v = (m[1] === '+' ? 1 : -1) * Number(`${m[2]}.${m[3]}`)
    return Math.abs(v - want) < 0.051 ? 'ok' : `shown ${v}, snapshot mean ${want.toFixed(3)} over ${est.length}`
  }, { timeout: 75_000, intervals: [3000] }).toBe('ok')
  expect(shown).toContain(w.avgCaption)
  expect(shown).toMatch(new RegExp(`\\d\\${w.decimal}\\d`))
  console.log('average', JSON.stringify(shown), 'snapshot mean', want.toFixed(3))
  await avg.scrollIntoViewIfNeeded()
  await step('average delay')
  // the share per mode
  const region = sheet.getByRole('region', { name: w.withDelays })
  await region.scrollIntoViewIfNeeded()
  await expect(region).toBeVisible()
  await expect.poll(async () => {
    const s = await snapshot(page)
    const modes = [...new Set(s.trips.map((t: any) => t.mode))] as string[]
    const out: string[] = []
    const meters = region.getByRole('meter')
    if (await meters.count() !== modes.length) out.push(`meters ${await meters.count()} vs modes ${modes.join(',')}`)
    for (const mode of modes) {
      const meter = region.getByRole('meter', { name: w.modes[mode], exact: true })
      if (await meter.count() !== 1) { out.push(`no meter ${mode}`); continue }
      const line = (await meter.locator('xpath=following-sibling::*[1]').innerText()).trim()
      const vt = await meter.getAttribute('aria-valuetext'), color = await meter.getAttribute('data-color')
      if (mode === 'metro' || mode === 'light-rail') {
        const wantLine = mode === 'metro' ? w.metroLine : w.lightRailLine
        if (vt !== w.unknown || color !== 'neutral' || line !== wantLine) out.push(`${mode}: ${vt} ${color} ${line}`)
      } else {
        const ts = s.trips.filter((t: any) => t.mode === mode && !t.cancelled)
        const n = ts.filter((t: any) => t.updated).length
        const wantLine = `${n}/${ts.length} · ${w.operator[mode]}`
        if (line !== wantLine) out.push(`${mode}: "${line}" vs "${wantLine}" (${vt})`)
      }
    }
    return out.join('; ') || 'ok'
  }, { timeout: 75_000, intervals: [3000] }).toBe('ok')
  const lines = await region.getByRole('paragraph').allInnerTexts()
  const vts = await region.getByRole('meter').evaluateAll((ms) => ms.map((m) => `${m.getAttribute('aria-label') ?? m.textContent}=${m.getAttribute('aria-valuetext')}/${m.getAttribute('data-color')}`))
  console.log('with delays', JSON.stringify(lines), JSON.stringify(vts))
  await step('with delays, by mode')
  // the position meters keep saying no live positions are connected yet
  const reported = sheet.getByRole('group', { name: w.reported })
  await expect(reported).toContainText('—')
  await expect(reported).toContainText(w.noLive)
  const live = sheet.getByRole('region', { name: w.reportingLive })
  await live.scrollIntoViewIfNeeded()
  const lm = live.getByRole('meter')
  const n = await lm.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) {
    const m = lm.nth(i)
    const name = (await m.getAttribute('aria-label')) ?? (await m.innerText())
    const line = (await m.locator('xpath=following-sibling::*[1]').innerText()).trim()
    expect(await m.getAttribute('aria-valuetext'), name).toBe(w.unknown)
    expect(line, name).toBe(/Metro/.test(name) ? w.metroLine : w.noLive)
  }
  await expect(sheet.getByRole('group', { name: lang === 'en' ? 'Reporting live' : 'Melder live', exact: true })).toHaveCount(0)
  console.log('reported', JSON.stringify(await reported.innerText()), 'live meters', n)
  await step('position meters still without live positions')
  if (phone) {
    await noSideways(page, expect, [avg, reported, ...(await region.getByRole('paragraph').all()), ...(await live.getByRole('paragraph').all())], sheet)
    await region.scrollIntoViewIfNeeded()
    await step('phone: lines inside the sheet')
  }
}

/** The corner credit and About credit Rejsekort & Rejseplan A/S, and About names the delays with their latest update. */
export async function about(j: Journey, lang: Lang) {
  const { page, step, expect } = j
  const w = W[lang]
  const phone = page.viewportSize()!.width < 600
  await tableFilled(j)
  await page.goto(`/${lang}`)
  const link = page.getByRole('link', { name: 'Rejseplanen', exact: true })
  await expect(link).toBeVisible()
  const credit = link.locator('xpath=..')
  const t0 = Date.now()
  await expect(credit).toContainText(w.cornerCredit, { timeout: 30_000 })
  console.log('credit gained the delays', Date.now() - t0, 'ms after the Rejseplanen link showed')
  const ct = await credit.innerText()
  console.log('credit', JSON.stringify(ct))
  expect(ct).toContain(w.cornerCredit)
  expect(ct).toMatch(/^[^·]*Rejseplanen \(CC BY 4\.0\) · /)
  await expect(credit.getByRole('link', { name: /Rejsekort/ })).toHaveCount(0)
  // the company sits unlinked between the Rejseplanen credit and the next
  const order = ct.indexOf(w.cornerCredit)
  expect(order).toBeGreaterThan(ct.indexOf('Rejseplanen'))
  if (phone) {
    const cb = (await credit.boundingBox())!, sb = (await page.getByRole('dialog', { name: w.sheet }).boundingBox())!
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(sw, 'page scrolls sideways').toBeLessThanOrEqual(cw)
    expect(cb.x).toBeGreaterThanOrEqual(0)
    expect(cb.x + cb.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
    expect(cb.y + cb.height, 'credit above the sheet peek').toBeLessThanOrEqual(sb.y + 1)
    console.log('credit box', JSON.stringify(cb), 'sheet top', sb.y)
  }
  await step('corner credit names Rejsekort & Rejseplan A/S')
  // open About as a rider would: the top bar's button on desktop, the credit's Rejseplanen link on a phone
  if (phone) await link.click()
  else await page.getByRole('button', { name: w.about }).click()
  const dialog = page.getByRole('dialog', { name: w.about })
  await expect(dialog).toBeVisible()
  await step('about opened')
  const term = dialog.getByRole('term').filter({ hasText: new RegExp(`^${w.delaysFact}$`) })
  await expect(term).toHaveCount(1)
  const def = term.locator('xpath=following-sibling::*[1]')
  let got = '', want = ''
  await expect.poll(async () => {
    const s = await snapshot(page)
    want = clock(s.updates.lastMessage)
    got = (await def.innerText()).trim()
    return got === `${w.delaysValue}${want}` ? 'ok' : `${got} vs lastMessage ${want}`
  }, { timeout: 75_000, intervals: [3000] }).toBe('ok')
  console.log('delays fact', JSON.stringify(got))
  await term.scrollIntoViewIfNeeded()
  await step('about: delays as a source with their latest update')
  const credits = dialog.getByText(w.credits, { exact: true })
  await expect(credits).toBeVisible()
  const ctext = await credits.innerText()
  expect(ctext, 'no licence on the delays credit').not.toMatch(/CC BY|licen/i)
  await credits.scrollIntoViewIfNeeded()
  if (phone) await noSideways(page, expect, [credits, def], dialog)
  await step('about: delays credited to Rejsekort & Rejseplan A/S')
}
