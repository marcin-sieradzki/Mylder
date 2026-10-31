import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule: a rider whose system is in dark mode opens a tilted link at zoom 16, then 14, then 13.5,
// and sees the blocks standing in Perron's building-3d colour at its opacity, faces shaded,
// standing from zoom 14 and lying flat below it.
export default async ({ page, step, expect }: Journey) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const map = page.locator('[data-vehicles]')
  const open = async (zoom: string, settle = 15000) => {
    await page.goto(`/en?map=${zoom}/55.68000/12.57000/-30.0/60.0`)
    await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 30000 })
    await expect(map).toHaveAttribute('data-tilt', '60', { timeout: 30000 })
    await expect(map).toHaveAttribute('data-heading', '-30')
    await page.waitForTimeout(settle)
  }
  await open('16.00')
  expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe('dark' === 'dark')
  await step('zoom 16 tilt 60 dark')
  const snapshot = await (await page.request.get('/api/snapshot')).json()
  const live = snapshot.trips.filter((t: { cancelled?: boolean }) => !t.cancelled).length
  await expect(map).toHaveAttribute('data-vehicles', String(live))
  await open('14.00')
  await step('zoom 14 tilt 60 dark')
  await open('13.50')
  await step('zoom 13.5 tilt 60 dark footprints')
}
