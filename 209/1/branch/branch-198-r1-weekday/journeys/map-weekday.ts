import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// moving-map: map-draw and map-chrome on the weekday recording (its explicit source is unchanged).
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '17')
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })).toBeVisible()
  await expect(page.getByText(/^Timetable only: live positions/)).toHaveCount(0)
  const snap = await (await page.request.get('/api/snapshot')).json()
  expect(snap.source.kind).not.toBe('timetable')
  await step('weekday map')
}
