// Pass rules 1-5: City pulse on the timetable source, desktop, English.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  await expect(map).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await expect(sheet.getByRole('tab', { name: 'City pulse' })).toHaveAttribute('aria-selected', 'true')
  await step('City pulse open on the timetable source')
  const snap = await (await page.request.get('/api/snapshot')).json()
  expect(snap.source).toEqual({ kind: 'timetable' })

  // 1. counts by mode: On the move = sum of modes, each = its chip; "of N in service", N = trips
  await expect(async () => {
    const s = await (await page.request.get('/api/snapshot')).json()
    const n = s.trips.length
    const move = sheet.getByRole('group', { name: 'On the move' })
    const moveText = await move.innerText()
    expect(moveText).toContain(`of ${n} in service`)
    const moving = Number(moveText.match(/On the move\s*([\d,]+)/)![1].replace(/,/g, ''))
    const region = sheet.getByRole('region', { name: 'On the move, by mode' })
    const terms = await region.locator('dt').allInnerTexts()
    const defs = await region.locator('dd').allInnerTexts()
    expect(terms.length).toBeGreaterThan(0)
    expect(terms.length).toBe(defs.length)
    const sum = defs.reduce((a, d) => a + Number(d.replace(/,/g, '')), 0)
    expect(sum).toBe(moving)
    for (let i = 0; i < terms.length; i++) {
      const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: new RegExp(`^${terms[i]} `) })
      await expect(chip).toHaveAccessibleName(`${terms[i]} ${defs[i]}`)
    }
  }).toPass({ timeout: 30000 })

  // 2. meters: "—" with the line, not 0 % in red
  for (const name of ['Reported this minute', 'Reporting live']) {
    const g = sheet.getByRole('group', { name })
    await expect(g).toContainText('No live positions yet; placed from the timetable')
    const t = await g.innerText()
    expect(t).toContain('—')
    expect(t).not.toMatch(/\d+\s*%/)
  }
  const meters = sheet.getByRole('region', { name: 'Reporting live, by mode' }).getByRole('meter')
  const count = await meters.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    const m = meters.nth(i)
    const name = (await m.getAttribute('aria-label')) ?? (await m.innerText())
    await expect(m).toHaveAttribute('aria-valuetext', 'Unknown')
    await expect(m).toHaveAttribute('data-color', 'neutral')
    console.log(`meter ${name}`)
  }
  const region = sheet.getByRole('region', { name: 'Reporting live, by mode' })
  expect(await region.innerText()).not.toMatch(/\d+\s*%/)
  await expect(region).toContainText('No live positions yet; placed from the timetable')
  await expect(region).toContainText('No realtime from the Metro; placed from the timetable')
  await region.scrollIntoViewIfNeeded()
  await step('meters read dash, neutral, with their lines')

  // 3. no average delay
  await expect(sheet.getByRole('group', { name: 'Average delay' })).toHaveCount(0)
  await expect(sheet.getByText(/Average delay/i)).toHaveCount(0)

  // 4. source line names the timetable
  const placed = sheet.locator('time', { hasText: /^placed \d\d:\d\d:\d\d$/ })
  await expect(placed.first()).toBeVisible()
  const line = await placed.first().locator('xpath=..').innerText()
  expect(line).toMatch(/^Timetable\s·\splaced \d\d:\d\d:\d\d$/)
  const panelText = await sheet.getByRole('tabpanel').innerText()
  expect(panelText).not.toContain('Rejseplanen ·')
  expect(panelText).not.toMatch(/paused/i)
  expect(panelText).not.toMatch(/positions from Rejseplanen/i)

  // How sure are we: Timetable only item
  const sure = sheet.getByRole('list', { name: 'How sure are we?' })
  await expect(async () => {
    const s = await (await page.request.get('/api/snapshot')).json()
    await expect(sure.getByRole('listitem').filter({ hasText: 'Timetable only' })).toHaveText(
      new RegExp(`Timetable only\\s*${s.trips.length}\\s*No live positions yet; placed from the timetable\\.`))
  }).toPass({ timeout: 30000 })

  // 5. planned-trips chart stays
  const chart = sheet.getByRole('figure', { name: "Vehicles in service today Planned, from today's timetable" })
  await expect(chart).toBeVisible()
  await chart.scrollIntoViewIfNeeded()
  await expect(sheet.getByText(/^Peak [\d,]+ at \d\d:\d\d$/)).toBeVisible()
  await step('planned-trips chart with its peak')
  await sure.scrollIntoViewIfNeeded()
  await step('how sure are we')
}
