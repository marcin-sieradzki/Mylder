import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { findDots } from './find-dots.ts'

// Regression, moving-map: map-draw, map-chrome, map-filter, map-controls, map-card. Entry: open /en.
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  const drawn = snap.trips.filter((t: { state: string }) => t.state !== 'cancelled')
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(drawn.length))
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })).toBeVisible()
  await step(`map drawn, ${drawn.length} dots`)
  const buses = drawn.filter((t: { mode: string }) => t.mode === 'bus').length
  const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })
  await chip.click()
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(drawn.length - buses))
  await expect(chip).toContainText(String(buses))
  await step('buses off')
  await chip.click()
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(drawn.length))
  await step('buses back')
  const scale = page.getByText(/\d+\s(m|km)$/)
  const before = await scale.textContent()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(scale).not.toHaveText(before!)
  await step(`zoomed in, scale ${before} to ${await scale.textContent()}`)
  // Card: pause, centre on a bus, hover the drawn dot nearest the middle.
  await page.getByRole('button', { name: 'Pause' }).click()
  const now = (await (await page.request.get('/api/snapshot')).json()).trips
  // A Live trip draws a filled dot, which findDots can see; the first minutes have Live trips.
  const bus = now.find((t: { state: string }) => t.state === 'live')
  if (!bus) throw new Error('no Live trip in this minute of the recording to hover')
  await page.goto(`/en?map=15.00/${bus.position[0]}/${bus.position[1]}`)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(2000)
  await step(`paused near ${bus.line}`)
  const vp = page.viewportSize()!
  await expect(async () => {
    const dots = (await findDots(page, 0)).sort(
      (a, b) => Math.hypot(a.x - vp.width / 2, a.y - vp.height / 2) - Math.hypot(b.x - vp.width / 2, b.y - vp.height / 2),
    )
    expect(dots.length).toBeGreaterThan(0)
    await page.mouse.move(dots[0].x, dots[0].y)
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30_000 })
  await expect(page.getByRole('tooltip')).toContainText(/Live|Estimated|Timetable|Ageing|No signal/)
  await step(`card: ${await page.getByRole('tooltip').textContent()}`)
}
