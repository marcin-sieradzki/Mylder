import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
import { L } from './_lib.ts'
// Pass rule: timetable source with under 7 days of timetable left -> the timetable notice shows,
// above the timetable source's banner, with no Paused notice; in English and Danish.
const notice = {
  en: /^The timetable ends on 26 August\. Without a new one, the map has no trips after that\.$/,
  da: /^Køreplanen slutter 26\. august\. Uden en ny har kortet ingen ture derefter\.$/,
}
const credit = {
  en: /Timetable data: Rejseplanen, under CC BY 4\.0\. Timetable of 2 June\./,
  da: /Køreplansdata: Rejseplanen, under CC BY 4\.0\. Køreplan fra 2\. juni\./,
}
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  dump('snapshot-status', { source: snap.source, serviceDay: snap.serviceDay, timetableRunningOut: snap.timetableRunningOut, timetable: snap.status.timetable, trips: snap.trips.length, states: [...new Set(snap.trips.map((t: { state: string }) => t.state))] })
  if (!(snap.status.timetable.daysLeft < 7)) throw new Error(`Precondition not reached: ${snap.status.timetable.daysLeft} days left`)
  expect(snap.source).toEqual({ kind: 'timetable' })
  expect(snap.timetableRunningOut).toBe(true)
  for (const lang of ['en', 'da'] as const) {
    const t = L[lang]
    await page.goto(`/${lang}`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
    await expect(page.getByRole('status').filter({ hasText: notice[lang] })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('status').filter({ hasText: /adsb\.lol/ })).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(3000)
    await step(`${lang} map with the timetable notice`)
    const statuses: string[] = []
    for (const s of await page.getByRole('status').all()) {
      if (!(await s.isVisible())) continue
      if (await s.evaluate((el) => !!el.closest('[role=dialog]'))) continue
      const text = (await s.innerText()).replace(/\n/g, ' ').trim()
      if (text) statuses.push(text)
    }
    dump(`statuses-${lang}`, statuses)
    dump(`vehicles-${lang}`, (await page.locator('[data-vehicles]').getAttribute('data-vehicles')) ?? '')
    expect(statuses).toHaveLength(2)
    expect(statuses[0]).toMatch(notice[lang])
    expect(statuses[1]).toMatch(t.banner)
    const overview = await page.getByRole('dialog', { name: t.overview }).innerText()
    expect((await page.locator('body').innerText()).replace(overview, '')).not.toMatch(t.paused)
    await page.getByRole('button', { name: t.about }).click()
    const d = page.getByRole('dialog', { name: t.about })
    await expect(d).toBeVisible()
    const about = await d.innerText()
    dump(`about-${lang}`, about)
    expect(about).toMatch(credit[lang])
    await d.getByText(credit[lang]).scrollIntoViewIfNeeded()
    await step(`${lang} about credit with the fixture timetable's date`)
    await page.keyboard.press('Escape')
    await expect(d).toBeHidden()
  }
}
