import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import type { Page } from '@playwright/test'

const fetched = async (page: Page) => (await (await page.request.get('/api/snapshot')).json()).fetched as string | number
async function waitMinute(page: Page, expect: Journey['expect'], iso: string) {
  await expect.poll(async () => new Date(await fetched(page)).toISOString() >= iso, { timeout: 180000, intervals: [2000] }).toBe(true)
}

export async function fromMap({ page, step, expect }: Journey) {
  await page.goto('/en?map=15.00/55.6925/12.58779')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map at Østerport')
  const vp = page.viewportSize()!
  const panel = page.getByRole('dialog', { name: 'Østerport St.' })
  await expect(async () => {
    await page.mouse.click(vp.width / 2, vp.height / 2)
    await expect(panel).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30000 })
  await expect(page).toHaveURL(/[?&]stop=/)
  const tablist = panel.getByRole('tablist', { name: 'Departures and arrivals' })
  await expect(tablist.getByRole('tab', { name: 'Departures' })).toHaveAttribute('aria-selected', 'true')
  const first = panel.getByRole('list', { name: 'Departures' }).getByRole('listitem').first()
  await expect(first).toBeVisible()
  console.log('first row', await first.innerText())
  await step('stop panel from map, list')
}

export async function standing({ page, step, expect }: Journey) {
  await page.goto('/en?stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('991')
  await expect(region).toContainText('Teglholmen')
  await expect(region).toContainText(/Live|Estimated|Ageing|Timetable only/)
  await expect(region).toContainText(/\d{2}:\d{2}/)
  const rb = await region.boundingBox(); const tb = await panel.getByRole('tablist', { name: 'Departures and arrivals' }).boundingBox()
  expect(rb!.y).toBeLessThan(tb!.y)
  await step('standing at Refshaleøen')
  await region.getByRole('button', { name: 'Bus 991 to Teglholmen' }).click()
  await expect(page.getByRole('dialog', { name: /991 to Teglholmen/ })).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=/); expect(page.url()).not.toContain('stop=')
  await step('standing row opens vehicle')
}

export async function track({ page, step, expect }: Journey) {
  await waitMinute(page, expect, '2026-06-16T05:22:00.000Z')
  await page.goto('/en?stop=8600783')
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Rejseplanen'); await expect(panel).toContainText(/departures \d{2}:\d{2}/)
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('RE'); await expect(region).toContainText('Næstved St.'); await expect(region).toContainText('Track 8')
  await step('RE standing with Track 8')
}

export async function standingPhone({ page, step, expect }: Journey) {
  await page.goto('/en?hide=bus&map=17.00/55.69105/12.60675')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Overview' })).toBeVisible()
  await step('map at Refshaleøen, buses hidden, Overview open')
  const overview = page.getByRole('dialog', { name: 'Overview' })
  await overview.getByRole('button', { name: 'Close' }).click()
  await expect(overview).toBeHidden()
  await step('Overview closed')
  const vp = page.viewportSize()!
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(async () => {
    await page.touchscreen.tap(vp.width / 2, vp.height / 2)
    await expect(panel).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30000 })
  await expect(panel).toHaveAttribute('data-anchor', 'bottom')
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await step('stop sheet, none standing with buses hidden')
  await page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ }).click()
  const list = region.getByRole('list', { name: 'At the platforms now' })
  await expect(list).toBeVisible()
  expect(await list.evaluate((l) => getComputedStyle(l).overflowX)).toBe('auto')
  const cards = list.getByRole('listitem'); await expect(cards).toHaveCount(1)
  const card = cards.first()
  for (const t of ['991', 'Teglholmen', 'Estimated', '~07:23']) await expect(card).toContainText(t)
  const cb = await card.boundingBox(); const lb = await list.boundingBox(); const tb = await panel.getByRole('tablist', { name: 'Departures and arrivals' }).boundingBox()
  console.log('card', JSON.stringify(cb), 'list', JSON.stringify(lb), 'tablist', JSON.stringify(tb), 'vp', JSON.stringify(vp))
  expect(cb!.width).toBeLessThan(lb!.width); expect(cb!.y).toBeLessThan(tb!.y)
  expect(cb!.y + cb!.height, 'card at the peek').toBeLessThanOrEqual(vp.height)
  await step('buses shown, one card')
  await card.getByRole('button', { name: 'Bus 991 to Teglholmen' }).click()
  await expect(page.getByRole('dialog', { name: /991 to Teglholmen/ })).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=/); expect(page.url()).not.toContain('stop=')
  await step('card opens vehicle')
}

export async function standingPhoneTrack({ page, step, expect }: Journey) {
  await waitMinute(page, expect, '2026-06-16T05:22:00.000Z')
  await page.goto('/en?map=17.00/55.65263/12.51685')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map at København Syd')
  const overview = page.getByRole('dialog', { name: 'Overview' })
  await overview.getByRole('button', { name: 'Close' }).click()
  await expect(overview).toBeHidden()
  await step('Overview closed')
  const vp = page.viewportSize()!
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  await expect(async () => {
    await page.touchscreen.tap(vp.width / 2, vp.height / 2)
    await expect(panel).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30000 })
  const list = panel.getByRole('list', { name: 'At the platforms now' })
  for (const t of ['RE', 'Næstved St.', 'Track 8']) await expect(list).toContainText(t)
  await step('RE card with Track 8')
}

export async function inFrontRecipe({ page, step, expect }: Journey) {
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Overview' })).toBeAttached()
  await step('stop link, Overview at peek')
  await panel.getByRole('tab', { name: 'Arrivals' }).click({ timeout: 10000 })
  await expect(page).toHaveURL(/&board=arrivals/)
  await step('Arrivals clicked')
  await page.goto('/en?stop=48645&board=arrivals')
  const r = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(r.getByRole('tab', { name: 'Arrivals' })).toHaveAttribute('aria-selected', 'true')
  await step('Refshaleøen on Arrivals')
  await r.getByRole('button', { name: 'Bus 991 to Teglholmen' }).click({ timeout: 10000 })
  await expect(page.getByRole('dialog', { name: /991 to Teglholmen/ })).toBeVisible()
  await step('card opens vehicle')
}

export async function noneStanding({ page, step, expect }: Journey) {
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('No vehicle of the types shown is standing at the platforms now.')
  await expect(region.getByRole('list')).toHaveCount(0)
  await step('none standing')
  await page.goto('/da?stop=27532')
  await expect(page.getByRole('dialog', { name: 'Nørreport St.' }).getByRole('region', { name: 'Ved perronerne nu' })).toBeVisible()
  await step('Danish region')
}

export async function arrivals({ page, step, expect }: Journey) {
  await waitMinute(page, expect, '2026-06-16T05:21:00.000Z')
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  await page.waitForTimeout(1000)
  expect(urls.filter((u) => u.endsWith('/arrivals'))).toEqual([])
  await step('Departures, no arrivals asked')
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(page).toHaveURL(/\?stop=27532&board=arrivals$/)
  const list = panel.getByRole('tabpanel', { name: 'Arrivals' }).getByRole('list', { name: 'Arrivals' })
  await expect(list).toBeVisible()
  await page.waitForTimeout(1000)
  expect(urls.filter((u) => u.includes('/api/stops/27532/arrivals')).length).toBe(1)
  const first = list.getByRole('listitem').first()
  console.log('first arrival', await first.innerText())
  for (const t of ['E', 'From Holte St.', '07:27']) await expect(first).toContainText(t)
  await expect(first).toContainText(/07:2[89]/)
  await expect(list).toContainText('From Sundbyvester Plads'); await expect(list).toContainText('From Herlev Hospital, Sløjfen')
  await expect(panel).toContainText('From the timetable'); await expect(panel).toContainText(/Timetable and positions \d{2}:\d{2}/)
  await step('Arrivals list')
  await panel.getByRole('tab', { name: 'Departures' }).click()
  await expect(page).toHaveURL(/\?stop=27532$/)
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  await step('back to Departures')
}

export async function arrivalsBoard({ page, step, expect }: Journey) {
  await page.goto('/en?stop=8600783&board=arrivals')
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  const list = panel.getByRole('list', { name: 'Arrivals' })
  await expect(list).toBeVisible()
  await expect(panel).toContainText(/arrivals \d{2}:\d{2}/); await expect(panel).toContainText('Rejseplanen')
  await expect(panel).toContainText("Countdowns use Rejseplanen's expected times where it has them; the rest use the timetable, and say so.")
  await expect(panel).not.toContainText('From the timetable'); await expect(panel).not.toContainText('Timetable and positions')
  const rows = await list.getByRole('listitem').allInnerTexts()
  console.log(rows.join('\n---\n'))
  for (const r of rows) expect(r).toContain('Track 8')
  const e = list.getByRole('listitem').filter({ hasText: 'From Holte St.' })
  for (const t of ['07:39', '07:41', '+2']) await expect(e.first()).toContainText(t)
  const call1 = (await panel.innerText()).match(/arrivals (\d{2}:\d{2})/)![1]
  await step('board arrivals')
  await page.reload()
  await expect(list).toBeVisible()
  const call2 = (await panel.innerText()).match(/arrivals (\d{2}:\d{2})/)![1]
  console.log('call times', call1, call2)
  expect(call2).toBe(call1)
  await step('reopened, same call time')
}

export async function arrivalsKeys({ page, step, expect }: Journey) {
  await page.goto('/en?stop=48645&board=arrivals')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(panel.getByRole('tab', { name: 'Arrivals' })).toHaveAttribute('aria-selected', 'true')
  const row = panel.getByRole('list', { name: 'Arrivals' }).getByRole('listitem').filter({ hasText: 'From Orientkaj St.' }).first()
  for (const t of ['991', 'Timetable only', '07:47']) await expect(row).toContainText(t)
  await expect(panel.getByRole('button', { name: 'Bus 991 from Orientkaj St.' })).toBeVisible()
  await step('Refshaleøen arrivals')
  await panel.getByRole('tab', { name: 'Arrivals' }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(panel.getByRole('tab', { name: 'Departures' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(panel.getByRole('tab', { name: 'Departures' })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/\?stop=48645$/)
  await step('keys to Departures')
}

export async function arrivalsMetro({ page, step, expect }: Journey) {
  await page.goto('/en?stop=8603313&board=arrivals')
  const list = page.getByRole('dialog', { name: /Bella Center/ }).getByRole('list', { name: 'Arrivals' })
  const row = list.getByRole('listitem').filter({ hasText: 'From Vanløse St.' }).first()
  for (const t of ['M1', 'Every 4 min', 'Metro: planned times']) await expect(row).toContainText(t)
  await expect(row).not.toContainText(/\d{2}:\d{2}/)
  await step('Metro arrivals interval')
}

export async function noArrivals({ page, step, expect }: Journey) {
  await page.goto('/en?stop=8600683&board=arrivals')
  const panel = page.getByRole('dialog', { name: /Hillerød/ })
  await expect(panel).toContainText('No arrivals in the next 30 minutes for the vehicle types shown.')
  await expect(panel).toContainText(/Timetable and positions \d{2}:\d{2}/)
  await step('no arrivals')
}

export async function language({ page, step, expect }: Journey) {
  await page.goto('/en?stop=27532')
  const panel = page.getByRole('dialog', { name: 'Nørreport St.' })
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  await step('English')
  await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Dansk' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await expect(panel.getByRole('list', { name: 'Afgange' })).toBeVisible()
  await step('Danish, panel kept')
  await page.goto('/da?stop=27532&board=arrivals')
  await expect(panel.getByRole('tab', { name: 'Afgange' })).toBeVisible(); await expect(panel.getByRole('tab', { name: 'Ankomster' })).toBeVisible()
  await expect(panel.getByRole('list', { name: 'Ankomster' })).toContainText('Fra Holte St.')
  await step('Danish arrivals')
  await page.goto('/da?stop=8600683&board=arrivals')
  await expect(page.getByRole('dialog', { name: /Hillerød/ })).toContainText('Ingen ankomster de næste 30 minutter for de viste transportformer.')
  await step('Danish no arrivals')
}

export async function missing({ page, step, expect }: Journey) {
  await page.goto('/en?stop=nowhere')
  await expect(page.getByRole('dialog', { name: 'Stop not found' })).toBeVisible()
  await step('stop not found')
}

export async function firstPaint({ page, step, expect }: Journey) {
  await page.addInitScript(() => {
    const w = window as any; w.__rows = []; w.__dialogs = []
    const record = () => {
      document.querySelectorAll('[role="dialog"] ul[aria-label] li').forEach((li) => w.__rows.push(li.textContent))
      document.querySelectorAll('[role="dialog"]').forEach((d) => w.__dialogs.push(d.textContent))
    }
    new MutationObserver(record).observe(document, { subtree: true, childList: true, characterData: true })
  })
  await page.goto('/en?stop=27532')
  const list = page.getByRole('dialog', { name: 'Nørreport St.' }).getByRole('list', { name: 'Departures' })
  await expect(list.getByRole('listitem').first()).toContainText(/\d+ min/)
  const rows: string[] = await page.evaluate(() => (window as any).__rows)
  console.log('recorded rows', rows.length, 'Now rows', rows.filter((r) => /Now/.test(r)).length, 'dash rows', rows.filter((r) => /—/.test(r)).length)
  expect(rows.filter((r) => /\bNow\b/.test(r))).toEqual([])
  await step('Nørreport first paint')
  await page.goto('/en?stop=8600783&board=arrivals')
  await expect(page.getByRole('dialog', { name: 'København Syd St.' })).toContainText(/arrivals \d{2}:\d{2}/)
  const dialogs: string[] = await page.evaluate(() => (window as any).__dialogs)
  console.log('recorded dialogs', dialogs.length)
  expect(dialogs.filter((d) => d.includes('may be out of date'))).toEqual([])
  await step('København Syd first paint')
}

export async function vehicleOpenClose({ page, step, expect }: Journey) {
  await page.goto('/en')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('tab', { name: /^Vehicles/ }).click()
  await expect(page).toHaveURL(/tab=vehicles/)
  const table = sheet.getByRole('table', { name: 'Vehicles' })
  await expect(table).toBeVisible()
  await step('Vehicles list')
  await table.getByRole('row').nth(1).getByRole('link').first().click()
  const v = page.getByRole('dialog', { name: / to / })
  await expect(v).toBeVisible(); await expect(page).toHaveURL(/trip=/)
  for (const t of ['Delay', 'Last seen', 'Next stop']) await expect(v).toContainText(t)
  await expect(v.getByRole('list', { name: 'Stops' })).toBeVisible()
  await step('vehicle open from list')
  await v.getByRole('button', { name: 'Close' }).click()
  await expect(v).toBeHidden(); expect(page.url()).not.toContain('trip=')
  await step('closed with Close')
  await table.getByRole('row').nth(2).getByRole('link').first().click()
  await expect(v).toBeVisible(); await expect(page).toHaveURL(/trip=/)
  await step('second vehicle open')
  await page.keyboard.press('Escape')
  await expect(v).toBeHidden(); expect(page.url()).not.toContain('trip=')
  await step('closed with Escape')
  await page.goto('/en?trip=nothing')
  await expect(page.getByRole('dialog', { name: 'Trip not found' })).toBeVisible()
  await step('trip not found')
}
