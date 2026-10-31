import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Regression, moving-map map-3d: tilt and turn by keys, then Centre the map.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const cam = page.locator('[data-vehicles]')
  await expect(cam).toHaveAttribute('data-tilt', '0', { timeout: 20_000 })
  const scale = page.getByText(/\d+\s(m|km)$/)
  await expect(scale).toBeVisible()
  await step('flat map')
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  for (const key of ['Shift+ArrowUp', 'Shift+ArrowUp', 'Shift+ArrowUp', 'Shift+ArrowRight', 'Shift+ArrowRight']) {
    await page.keyboard.press(key)
    await page.waitForTimeout(500)
  }
  await expect(cam).toHaveAttribute('data-tilt', '30', { timeout: 10_000 })
  await expect(cam).toHaveAttribute('data-heading', '30', { timeout: 10_000 })
  await expect(scale).toBeHidden()
  const snapshot = await (await page.request.get('/api/snapshot')).json()
  const live = snapshot.trips.filter((t: { cancelled?: boolean }) => !t.cancelled).length
  await expect(cam).toHaveAttribute('data-vehicles', String(live))
  await step('tilted 30 turned 30')
  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(cam).toHaveAttribute('data-tilt', '0', { timeout: 10_000 })
  await expect(cam).toHaveAttribute('data-heading', '0')
  await expect(scale).toBeVisible()
  await step('centred: flat and north-up')
}
