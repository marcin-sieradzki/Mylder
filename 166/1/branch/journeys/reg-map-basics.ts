import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Regression, moving map: map-draw, map-chrome, map-filter, map-controls from /en.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible({ timeout: 30000 })
  const snap = await (await page.request.get('/api/snapshot')).json()
  const trips = snap.trips.filter((t: { cancelled?: boolean }) => !t.cancelled)
  await expect(map).toHaveAttribute('data-vehicles', String(trips.length), { timeout: 20000 })
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
  await step('map drawn')
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })).toBeVisible()
  const buses = trips.filter((t: { mode: string }) => t.mode === 'bus').length
  const bus = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })
  await bus.click()
  await expect(map).toHaveAttribute('data-vehicles', String(trips.length - buses))
  await expect(bus).toContainText(String(buses))
  await step('bus off')
  await bus.click()
  await expect(map).toHaveAttribute('data-vehicles', String(trips.length))
  await step('bus back')
  const scale = page.getByText(/\d+\s(m|km)$/)
  const metres = async () => {
    const [, n, u] = (await scale.innerText()).match(/(\d+)\s(m|km)$/)!
    return Number(n) * (u === 'km' ? 1000 : 1)
  }
  const before = await metres()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(metres, { timeout: 10000 }).toBeLessThan(before)
  await step('zoomed in')
}
