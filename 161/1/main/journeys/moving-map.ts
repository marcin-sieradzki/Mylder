import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { findDots } from './find-dots.ts'

// Regression, moving-map: map-draw, map-chrome, map-filter, map-card, map-controls.
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(snap.trips.length))
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })).toBeVisible()
  await step('map drawn')
  const buses = snap.trips.filter((t: { mode: string }) => t.mode === 'bus').length
  const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })
  await chip.click()
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(snap.trips.length - buses))
  await expect(chip).toContainText(String(buses))
  await step('buses off')
  await chip.click()
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(snap.trips.length))
  await step('buses back')
  const scale = page.getByText(/\d+\s(m|km)$/)
  const before = await scale.textContent()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(scale).not.toHaveText(before!)
  await step(`zoomed in, scale ${before} -> ${await scale.textContent()}`)
  // Card: hover a filled (Live) dot where it is drawn.
  // The recording has Live trips only in some minutes: wait up to two minutes for one.
  let live: any
  for (let i = 0; i < 24 && !live; i++) {
    live = (await (await page.request.get('/api/snapshot')).json()).trips.find((t: { state: string }) => t.state === 'live')
    if (!live) await page.waitForTimeout(5000)
  }
  if (!live) throw new Error('no Live trip in two minutes of the recording to hover')
  console.log('live', live.key)
  await page.goto(`/en?map=15.00/${live.position[0]}/${live.position[1]}`)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await page.getByRole('dialog', { name: 'Overview' }).getByRole('button', { name: /close/i }).click()
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(2000)
  await step('paused near a live dot')
  const vp = page.viewportSize()!
  const dots = (await findDots(page, 0)).sort((a, b) => Math.hypot(a.x - vp.width / 2, a.y - vp.height / 2) - Math.hypot(b.x - vp.width / 2, b.y - vp.height / 2))
  if (!dots.length) throw new Error('no filled dot drawn near the live trip')
  await page.mouse.move(dots[0].x, dots[0].y)
  await expect(page.getByRole('tooltip')).toContainText(live.line)
  await expect(page.getByRole('tooltip')).toContainText(/Live|Estimated|Timetable|Ageing|No signal/)
  await step(`card for ${live.line}`)
}
