import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// moving-map: map-timetable and map-chrome and map-filter on the default (timetable) source, /en then /da.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const updated = page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)
  await expect(updated).toBeVisible()
  await expect.poll(async () => Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles'))).toBeGreaterThan(0)
  await step('map on the timetable source')
  await expect(async () => {
    const snap = await (await page.request.get('/api/snapshot')).json()
    const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(snap.fetched))
    await expect(updated).toHaveText(`Updated ${t}`, { timeout: 1000 })
  }).toPass({ timeout: 70000 })
  const statuses = page.locator('[role=status]:not([role=dialog] [role=status])')
  await expect(statuses.filter({ hasText: /\S/ }).first()).toHaveText(/^Timetable only: live positions aren't connected yet, so every vehicle is placed where its timetable says it should be\.\s*Planes: /)
  await expect(page.getByText(/paused|hasn.t answered/i)).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
  await expect(page.getByText("Every vehicle is Timetable only for now: live positions aren't connected yet.")).toBeVisible()

  // Filter: Bus off and on.
  await page.getByRole('button', { name: 'Pause' }).click()
  const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })
  const busCount = Number((await chip.innerText()).replace(/\D+/g, ''))
  // The chip counts buses on the move; the map also draws Waiting buses at their first stop.
  const snapNow = await (await page.request.get('/api/snapshot')).json()
  const busDots = snapNow.trips.filter((t: any) => t.mode === 'bus' && !t.cancelled).length
  const before = Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles'))
  await step('before Bus filter')
  await chip.click()
  await expect.poll(async () => Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles'))).toBeLessThan(before)
  const after = Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles'))
  expect(Math.abs(before - after - busDots)).toBeLessThanOrEqual(5)
  await expect(chip).toContainText(String(busCount))
  await step('Bus filtered off')
  await chip.click()
  await expect.poll(async () => Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles'))).toBeGreaterThan(after)
  await step('Bus back')

  await page.goto('/da')
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await expect(page.getByText('Kun køreplan: der er endnu ingen livepositioner, så hvert køretøj er placeret, hvor køreplanen siger, det skal være.')).toBeVisible()
  await expect(page.getByText('Alle køretøjer er Kun køreplan indtil videre: der er endnu ingen livepositioner.')).toBeVisible()
  await step('Danish banner and legend')
}
