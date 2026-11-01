import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
const W = {
  en: { sheet: 'Overview', vehicles: /^Vehicles/, dis: /^Disruptions/, line: 'No live positions yet; placed from the timetable', state: 'Timetable only', src: /^Timetable\s·\splaced \d\d:\d\d:\d\d$/, placed: /^placed /, sentence: "Disruption messages come with Rejseplanen's live connection, which isn't connected yet." },
  da: { sheet: 'Overblik', vehicles: /^Køretøjer/, dis: /^Driftsforstyrrelser/, line: 'Ingen livepositioner endnu; placeret efter køreplanen', state: 'Kun køreplan', src: /^Køreplan\s·\splaceret \d\d:\d\d:\d\d$/, placed: /^placeret /, sentence: 'Driftsmeddelelser kommer med Rejseplanens liveforbindelse, som ikke er koblet på endnu.' },
}
export async function phone({ page, step, expect }: Journey, lang: 'en' | 'da') {
  const w = W[lang]
  await page.goto(`/${lang}`)
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  const sheet = page.getByRole('dialog', { name: w.sheet })
  await step('peek')
  // raise the sheet by dragging its heading up
  const h = await sheet.getByRole('heading', { name: w.sheet }).boundingBox()
  await page.mouse.move(h!.x + 20, h!.y + h!.height / 2)
  await page.mouse.down()
  await page.mouse.move(h!.x + 20, 120, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(600)
  await step('sheet raised')
  const vw = page.viewportSize()!.width
  const noSideways = async () => {
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.body.scrollWidth])
    expect(sw[0]).toBeLessThanOrEqual(sw[1])
    expect(sw[2]).toBeLessThanOrEqual(sw[1])
    const panel = sheet.getByRole('tabpanel')
    const over = await panel.evaluate((p) => p.scrollWidth - p.clientWidth)
    expect(over).toBeLessThanOrEqual(0)
  }
  const inside = async (loc: ReturnType<typeof page.locator>) => {
    const b = (await loc.boundingBox())!
    const s = (await sheet.boundingBox())!
    expect(b.x).toBeGreaterThanOrEqual(s.x)
    expect(b.x + b.width).toBeLessThanOrEqual(Math.min(s.x + s.width, vw) + 0.5)
  }
  // City pulse
  const lines = sheet.getByText(w.line, { exact: true })
  await expect(lines.first()).toBeVisible()
  for (const l of await lines.all()) { await l.scrollIntoViewIfNeeded(); await inside(l) }
  const src = sheet.locator('time', { hasText: w.placed }).first().locator('xpath=..')
  expect(await src.innerText()).toMatch(w.src)
  await inside(src)
  await noSideways()
  await sheet.getByRole('group').first().scrollIntoViewIfNeeded()
  await step('pulse top on a phone')
  await sheet.getByRole('meter').first().scrollIntoViewIfNeeded()
  await step('pulse meters on a phone')
  // Vehicles
  await sheet.getByRole('tab', { name: w.vehicles }).click()
  const table = sheet.getByRole('table')
  await expect(table).toBeVisible()
  const first = table.getByRole('rowgroup').nth(1).getByRole('row').first()
  await expect(first).toContainText(w.state)
  await inside(first.getByRole('cell').last())
  await noSideways()
  await step('vehicles on a phone')
  // Disruptions
  await sheet.getByRole('tab', { name: w.dis }).click()
  const p = sheet.getByRole('tabpanel')
  await expect(p).toHaveText(w.sentence)
  await inside(p.getByText(w.sentence))
  const lh = await p.getByText(w.sentence).evaluate((e) => [e.getBoundingClientRect().height, parseFloat(getComputedStyle(e).lineHeight)])
  console.log(`sentence height ${lh[0]}, line ${lh[1]}`)
  await noSideways()
  await step('disruptions on a phone')
}
