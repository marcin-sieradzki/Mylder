import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { realTap } from './lib.ts'
import { fetchedIso, footCheck, holdDrag, log, settle, tabsAtPeek, waitMinute } from './peek.ts'

// Regression (crowded): Show all at desktop; on a phone all six cards, no Show all.
export async function showAllDesktop({ page, step, expect }: Journey) {
  await page.goto('/en?stop=8600626')
  const panel = page.getByRole('dialog', { name: 'København H' })
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  const rows = region.getByRole('list').getByRole('listitem')
  await expect(rows).toHaveCount(4)
  const texts = await rows.allInnerTexts()
  log(texts)
  const want = [['RE', 'Næstved St.'], ['A', 'Hundige St.'], ['A', 'Hillerød St.'], ['E', 'Køge St.']]
  want.forEach(([l, d], i) => { expect(texts[i]).toContain(l); expect(texts[i]).toContain(d) })
  const btn = region.getByRole('button', { name: 'Show all 6' })
  await expect(btn).toHaveAttribute('aria-expanded', 'false')
  await step('four standing, Show all 6')
  await btn.click()
  await expect(rows).toHaveCount(6)
  const t2 = await rows.allInnerTexts()
  expect(t2[4]).toContain('Holte St.'); expect(t2[5]).toContain('Hillerød St.')
  await expect(region.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true')
  await step('six standing, Show fewer')
  await region.getByRole('button', { name: /Næstved St\./ }).click()
  await expect(page).toHaveURL(/[?&]trip=/); expect(page.url()).not.toContain('stop=')
  await step('row opens its vehicle')
}

// The Orientkaj St. 991 comes to stand at 07:25 by the minute's answer while a finger holds the sheet.
export async function naturalArrivalHeld({ page, step, expect }: Journey) {
  await waitMinute(page, expect, '2026-06-16T05:24:00.000Z')
  await page.goto('/en?stop=54307')
  const panel = page.getByRole('dialog', { name: 'Orientkaj St.' })
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await settle(page, panel)
  const t0 = (await panel.boundingBox())!.y
  log('fetched', await fetchedIso(page), 't0', t0)
  await step('Orientkaj, none standing yet, at its peek')
  await tabsAtPeek(page, panel, expect, 'Orientkaj before')
  await footCheck(page, expect, 'Orientkaj before')
  const d = await holdDrag(page, panel.getByRole('heading', { name: 'Orientkaj St.' }), -30)
  await page.waitForTimeout(300)
  const held = (await panel.boundingBox())!.y
  const samples: number[] = []
  const card = region.getByRole('button', { name: /^Bus 991/ })
  const end = Date.now() + 150000
  while (Date.now() < end && !(await card.count())) {
    samples.push(Math.round((await panel.boundingBox())!.y * 10) / 10)
    await page.waitForTimeout(250)
  }
  const arrived = (await card.count()) > 0
  for (let i = 0; i < 12; i++) { samples.push(Math.round((await panel.boundingBox())!.y * 10) / 10); await page.waitForTimeout(150) }
  log('arrived', arrived, 'fetched', await fetchedIso(page), 'held', held, 'samples min/max', Math.min(...samples), Math.max(...samples), samples.slice(-14))
  await step('991 came to stand while the finger holds')
  expect(arrived, 'the 991 came to stand at Orientkaj while held').toBe(true)
  expect(Math.max(...samples.map((s) => Math.abs(s - held))), 'sheet stays under the finger').toBeLessThan(3)
  await d.release()
  await settle(page, panel)
  log('after release', (await panel.boundingBox())!.y)
  await step('released: sheet on the taller peek')
  await tabsAtPeek(page, panel, expect, 'Orientkaj after release')
  await footCheck(page, expect, 'Orientkaj after release')
}

// A highlighted stretch (disruption Show on map) and then a stop's sheet opened from a ringed stop.
export async function highlightThenStop({ page, step, expect }: Journey) {
  await page.goto('/en?tab=disruptions')
  const overview = page.getByRole('dialog', { name: 'Overview' })
  await expect(overview.getByRole('list', { name: 'Active now' })).toBeVisible()
  const card = overview.getByRole('list', { name: 'Active now' }).getByRole('listitem').filter({ hasText: 'Linje 5C' })
  await card.getByRole('button', { name: 'Show on map' }).click()
  await expect(page.getByRole('button', { name: /^Showing: .* · Clear$/ })).toBeVisible()
  await page.waitForTimeout(3000)
  log('URL after fit', page.url())
  await step('5C stretch shown on map')
  await footCheck(page, expect, 'after Show on map', { strict: false })
  const vp = page.viewportSize()!
  const panel = page.getByRole('dialog', { name: 'Klaksvigsgade' })
  await expect(async () => {
    await page.touchscreen.tap(vp.width / 2, vp.height / 2)
    await expect(panel).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30000 })
  await settle(page, panel)
  log('stop top', (await panel.boundingBox())!.y, 'URL', page.url())
  await step('ringed stop tapped, its sheet at the peek')
  await tabsAtPeek(page, panel, expect, 'Klaksvigsgade')
  await footCheck(page, expect, 'Klaksvigsgade')
  await expect(page.getByRole('button', { name: /^Showing: .* · Clear$/ })).toBeVisible()
}

// The stop's sheet at its taller peek, then Show whole line from the standing card's vehicle at full height of the
// vehicle panel; and ?line= highlighting with a stop sheet open by link.
export async function lineWithStop({ page, step, expect }: Journey) {
  await page.goto('/en?line=991&stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(panel.getByRole('region', { name: 'At the platforms now' }).getByRole('button', { name: 'Bus 991 to Teglholmen' })).toBeAttached()
  await settle(page, panel)
  await page.waitForTimeout(2500)
  log('URL', page.url(), 'chip', await page.getByRole('button', { name: /^Showing: / }).count(), 'top', (await panel.boundingBox())!.y)
  await step('line 991 highlighted with Refshaleøen open')
  await tabsAtPeek(page, panel, expect, 'line + stop')
  await footCheck(page, expect, 'line + stop')
}

// Desktop: the stop's side panel and the credit, for comparison with main.
export async function desktopSample({ page, step, expect }: Journey) {
  for (const [id, name] of [['48645', 'Refshaleøen'], ['27532', 'Nørreport St.']]) {
    await page.goto(`/en?stop=${id}`)
    const panel = page.getByRole('dialog', { name })
    await expect(panel.getByRole('tablist', { name: 'Departures and arrivals' })).toBeVisible()
    await settle(page, panel)
    const tl = await panel.getByRole('tablist', { name: 'Departures and arrivals' }).boundingBox()
    const credit = await page.getByRole('link', { name: 'Rejseplanen' }).locator('xpath=..').boundingBox()
    const legend = await page.getByRole('list', { name: 'Data states' }).boundingBox()
    log('DESKTOP', name, { panel: await panel.boundingBox(), anchor: await panel.getAttribute('data-anchor'), tablist: tl, credit, legend, overview: await page.getByRole('dialog', { name: 'Overview' }).boundingBox() })
    await step(`desktop ${name}`)
  }
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(page).toHaveURL(/board=arrivals/)
  await step('desktop Arrivals')
}

// Vehicle detail on a phone: from a dot, facts, Follow, Show whole line and its chip, Close by button and Esc, missing.
export async function vehiclePhone({ page, step, expect }: Journey) {
  const snap = await (await page.request.get('/api/snapshot')).json()
  const trip = snap.trips.find((t: any) => t.mode === 'bus' && t.position) ?? snap.trips[0]
  const [lat, lon] = trip.position
  log('trip', trip.key, trip.line, trip.headsign, trip.position)
  await page.goto(`/en?map=15.00/${lat.toFixed(5)}/${lon.toFixed(5)}`)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await page.getByRole('button', { name: 'Pause' }).tap()
  await step('map on a bus, paused')
  const vp = page.viewportSize()!
  const v = page.getByRole('dialog', { name: / to / })
  // the dot has moved on from its snapshot position: tap points near the middle, nearest first,
  // closing any stop's sheet a tap opens instead
  const offs: [number, number][] = [[0, 0]]
  for (const r of [8, 16, 24, 32, 40]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) offs.push([dx * r, dy * r])
  for (const [dx, dy] of offs) {
    await page.touchscreen.tap(vp.width / 2 + dx, vp.height / 2 + dy)
    await page.waitForTimeout(700)
    if (await v.isVisible()) break
    if (page.url().includes('stop=')) { await page.keyboard.press('Escape'); await page.waitForTimeout(400) }
  }
  await expect(v).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=/)
  for (const t of ['Delay', 'Last seen', 'Next stop']) await expect(v).toContainText(t)
  await expect(v.getByRole('list', { name: 'Stops' })).toBeAttached()
  await settle(page, v)
  await step('vehicle from a dot, facts')
  await footCheck(page, expect, 'vehicle sheet')
  await realTap(page, v.getByRole('button', { name: 'Follow' }), / to /, [])
  await page.waitForTimeout(800)
  await step('Follow')
  await realTap(page, v.getByRole('button', { name: 'Show whole line' }), / to /, [])
  const chip = page.getByRole('button', { name: /^Showing: line .* · Clear$/ })
  await expect(chip).toBeVisible()
  await page.waitForTimeout(2500)
  await step('Show whole line, chip')
  await chip.tap()
  await expect(chip).toBeHidden()
  await step('chip cleared')
  await realTap(page, v.getByRole('button', { name: 'Close' }), / to /, [])
  await expect(v).toBeHidden(); expect(page.url()).not.toContain('trip=')
  await step('closed with Close')
  await page.goto(`/en?trip=${encodeURIComponent(trip.key)}`)
  await expect(v).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(v).toBeHidden(); expect(page.url()).not.toContain('trip=')
  await step('link, closed with Escape')
  await page.goto('/en?trip=nothing')
  await expect(page.getByRole('dialog', { name: 'Trip not found' })).toBeVisible()
  await step('trip not found')
}

// A line highlighted by Show whole line from the standing card's vehicle, then back to the stop: the line stays
// highlighted while the stop's taller sheet is open; is the fitted line still in view above it?
export async function lineThenStop({ page, step, expect }: Journey) {
  await page.goto('/en?stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region.getByRole('button', { name: 'Bus 991 to Teglholmen' })).toBeAttached()
  await settle(page, panel)
  await step('stop open')
  await realTap(page, region.getByRole('button', { name: 'Bus 991 to Teglholmen' }), 'Refshaleøen', [])
  const v = page.getByRole('dialog', { name: /991 to Teglholmen/ })
  await expect(v).toBeVisible()
  await realTap(page, v.getByRole('button', { name: 'Show whole line' }), /991 to Teglholmen/, [])
  const chip = page.getByRole('button', { name: /^Showing: line .* · Clear$/ })
  await expect(chip).toBeVisible()
  await page.waitForTimeout(3000)
  log('fit URL', page.url(), 'vehicle top', (await v.boundingBox())!.y)
  await step('Show whole line from the vehicle')
  await page.goBack()
  await expect(panel).toBeVisible()
  await settle(page, panel)
  await page.waitForTimeout(1500)
  log('back URL', page.url(), 'chip', await chip.count(), 'stop top', (await panel.boundingBox())!.y)
  await step('back to the stop, line highlighted')
  await tabsAtPeek(page, panel, expect, 'back to stop with line')
  await footCheck(page, expect, 'back to stop with line')
}

function project(url: string, vp: { width: number; height: number }, lat: number, lon: number) {
  const m = new URL(url).searchParams.get('map')!.split('/').map(Number)
  const [z, clat, clon] = m
  const ws = 512 * 2 ** z
  const mx = (l: number) => (l + 180) / 360
  const my = (a: number) => { const r = (a * Math.PI) / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 }
  return { x: vp.width / 2 + (mx(lon) - mx(clon)) * ws, y: vp.height / 2 + (my(lat) - my(clat)) * ws }
}

// Show whole line from the standing card's vehicle, close it, hide buses, tap Refshaleøen's marker on the fitted
// map, then show buses: the stop's sheet rises to its taller peek with the line still highlighted.
export async function lineThenTallerSheet({ page, step, expect }: Journey) {
  await page.goto('/en?stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region.getByRole('button', { name: 'Bus 991 to Teglholmen' })).toBeAttached()
  await settle(page, panel)
  await realTap(page, region.getByRole('button', { name: 'Bus 991 to Teglholmen' }), 'Refshaleøen', [])
  const v = page.getByRole('dialog', { name: /991 to Teglholmen/ })
  await expect(v).toBeVisible()
  await realTap(page, v.getByRole('button', { name: 'Show whole line' }), /991 to Teglholmen/, [])
  const chip = page.getByRole('button', { name: /^Showing: line .* · Clear$/ })
  await expect(chip).toBeVisible()
  await page.waitForTimeout(3000)
  log('fit URL', page.url())
  await step('Show whole line from the standing card vehicle')
  await realTap(page, v.getByRole('button', { name: 'Close' }), /991 to Teglholmen/, [])
  await expect(v).toBeHidden()
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ }).tap()
  await expect(chip).toBeVisible()
  await page.waitForTimeout(800)
  await step('vehicle closed, buses hidden, line still highlighted')
  const vp = page.viewportSize()!
  const p = project(page.url(), vp, 55.69105, 12.60675)
  log('Refshaleøen projected', p)
  const offs: [number, number][] = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [5, 5], [-5, -5], [5, -5], [-5, 5]]
  for (const [dx, dy] of offs) {
    await page.touchscreen.tap(p.x + dx, p.y + dy)
    await page.waitForTimeout(800)
    if (await panel.isVisible()) break
    if (/[?&](stop|trip)=/.test(page.url())) { log('opened other', page.url()); await page.keyboard.press('Escape'); await page.waitForTimeout(400) }
  }
  await expect(panel).toBeVisible()
  await settle(page, panel)
  log('stop top none standing', (await panel.boundingBox())!.y, page.url())
  await step('Refshaleøen tapped on the fitted map, none standing')
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ }).tap()
  await expect(region.getByRole('button', { name: 'Bus 991 to Teglholmen' })).toBeAttached()
  await settle(page, panel)
  await page.waitForTimeout(800)
  log('stop top standing', (await panel.boundingBox())!.y, 'chip', await chip.count(), page.url())
  await step('buses shown: taller peek with the line highlighted')
  await expect(chip).toBeVisible()
  await tabsAtPeek(page, panel, expect, 'line + taller sheet')
  await footCheck(page, expect, 'line + taller sheet')
}
