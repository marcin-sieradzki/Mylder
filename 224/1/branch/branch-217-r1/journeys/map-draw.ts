import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// map-draw on the updates:siri-et launch: the weekday's 17 doesn't apply, so the count is
// checked against /api/snapshot's trips that aren't cancelled, fetched at the same minute.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await step('map loaded')
  await expect(async () => {
    const snap = await (await page.request.get('/api/snapshot')).json()
    const drawn = snap.trips.filter((t: { cancelled?: boolean }) => !t.cancelled).length
    expect(drawn).toBeGreaterThan(0)
    await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(drawn), { timeout: 2000 })
  }).toPass({ timeout: 30000 })
  console.log('data-vehicles', await page.locator('[data-vehicles]').getAttribute('data-vehicles'))
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await step('dots drawn match snapshot')
}
