import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const dots = page.locator('[data-vehicles]')
  const snap = await (await page.request.get('/api/snapshot')).json()
  const n = snap.trips.filter((t: any) => !t.cancelled).length
  await expect(dots).toHaveAttribute('data-vehicles', String(n))
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })).toBeVisible()
  await step(`map drawn ${n}`)
  const buses = snap.trips.filter((t: any) => t.mode === 'bus' && !t.cancelled).length
  const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })
  await chip.click()
  await expect(dots).toHaveAttribute('data-vehicles', String(n - buses))
  await expect(chip).toContainText(String(buses))
  await step('buses filtered off')
  await chip.click()
  await expect(dots).toHaveAttribute('data-vehicles', String(n))
  await step('buses back')
  const scale = page.getByText(/\d+\s(m|km)$/)
  const before = await scale.innerText()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(scale).not.toHaveText(before)
  await step('zoomed in')
  // card
  const bus = snap.trips.find((t: any) => t.mode === 'bus' && !t.waiting)
  await page.goto(`/en?map=15.00/${bus.position[0].toFixed(5)}/${bus.position[1].toFixed(5)}`)
  await page.getByRole('button', { name: 'Pause' }).click()
  const vp = page.viewportSize()!
  await expect(async () => {
    const pts: number[][] = []
    for (let r = 0; r <= 160; r += 7) for (let a = 0; a < 360; a += r ? 20 : 360) pts.push([r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180)])
    for (const [dx, dy] of pts) {
      await page.mouse.move(vp.width / 2 + dx, vp.height / 2 + dy)
      if (await page.getByRole('tooltip').isVisible()) break
    }
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 500 })
  }).toPass({ timeout: 60000 })
  await expect(page.getByRole('tooltip')).toContainText(/Estimated|Live|Timetable|Ageing|No signal/)
  await step('hover card')
}
