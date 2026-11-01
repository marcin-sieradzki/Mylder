import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?map=14.00/55.67600/12.56800/-30.0/50.0')
  const v = page.locator('[data-vehicles]')
  await expect(v).toHaveAttribute('data-tilt', '50', { timeout: 20000 })
  await expect(v).toHaveAttribute('data-heading', '-30')
  await expect(page.getByText(/\d+\s(m|km)$/)).toBeHidden()
  const snap = await (await page.request.get('/api/snapshot')).json()
  await expect(v).toHaveAttribute('data-vehicles', String(snap.trips.filter((t: { state: string }) => t.state !== 'cancelled').length))
  await step('tilted link on a phone')
}
