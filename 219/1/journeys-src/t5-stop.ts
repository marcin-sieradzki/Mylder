import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { readFileSync } from 'node:fs'
import { dump } from './dump.ts'
const J = 't5-stop'
export default async ({ page, step, expect }: Journey) => {
  const rec = readFileSync(`.verify/${process.argv[2]}/recording`, 'utf8').trim()
  const [lat, lon] = rec === 'timetable' ? ['55.67259', '12.56661'] : ['55.67259', '12.56662']
  await page.goto(`/en?map=17.00/${lat}/${lon}`)
  const panel = page.getByRole('dialog', { name: 'Hovedbanegården, Tivoli' })
  const vp = page.viewportSize()!
  await expect(async () => {
    await page.mouse.click(vp.width / 2, vp.height / 2)
    await expect(panel).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 45000 })
  await expect(page).toHaveURL(/stop=1084/)
  const deps = panel.getByRole('list', { name: 'Departures' })
  await expect(deps.getByRole('listitem').first()).toBeVisible()
  for (const row of await deps.getByRole('listitem').allInnerTexts()) {
    expect(row).toContain('Timetable only')
    expect(row).toContain('—')
  }
  await expect(panel).toContainText("Countdowns use the timetable alone; live times aren't connected yet.")
  await expect(panel).toContainText(/Timetable\s·\s\d\d:\d\d:\d\d/)
  await expect(panel).not.toContainText(/Rejseplanen|From the timetable|Timetable and positions/)
  await page.waitForTimeout(800)
  await step('tivoli departures')
  dump(J, 'en.tivoli.departures', await panel.innerText())
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(page).toHaveURL(/board=arrivals/)
  await expect(panel.getByRole('tabpanel', { name: 'Arrivals' })).toBeVisible()
  await expect(panel).toContainText("Countdowns use the timetable alone; live times aren't connected yet.")
  await page.waitForTimeout(1500)
  await step('tivoli arrivals')
  dump(J, 'en.tivoli.arrivals', await panel.innerText())
  if (rec === 'timetable') {
    await page.goto('/en?stop=8603332')
    const m = page.getByRole('dialog', { name: 'Gammel Strand St.' })
    await expect(m).toContainText(/Every \d+ min/)
    await expect(m).toContainText('Metro: planned times')
    await expect(m).toContainText("Countdowns use the timetable alone; live times aren't connected yet.")
    await page.waitForTimeout(800)
    await step('gammel strand')
    dump(J, 'en.gammelstrand', await m.innerText())
  }
  await page.goto(`/da?map=17.00/${lat}/${lon}`)
  const dp = page.getByRole('dialog', { name: 'Hovedbanegården, Tivoli' })
  await expect(async () => {
    await page.mouse.click(vp.width / 2, vp.height / 2)
    await expect(dp).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 45000 })
  await expect(dp).toContainText('Nedtællinger bruger kun køreplanen; realtiden er ikke koblet på endnu.')
  await expect(dp).toContainText(/Køreplan\s·\s\d\d:\d\d:\d\d/)
  await page.waitForTimeout(800)
  await step('da tivoli')
  dump(J, 'da.tivoli.departures', await dp.innerText())
}
