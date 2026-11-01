import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
  const snap = await (await page.request.get('/api/snapshot')).json()
  const n = snap.trips.filter((t: { state: string }) => t.state !== 'cancelled').length
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(n), { timeout: 20000 })
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })).toBeVisible()
  await step(`map drawn ${n}`)
}
