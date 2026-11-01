import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  const dots = page.locator('[data-vehicles]')
  await page.goto('/en?map=14.00/55.67600/12.56800/-30.0/50.0')
  await expect(dots).toHaveAttribute('data-tilt', '50')
  await expect(dots).toHaveAttribute('data-heading', '-30')
  const snap = await (await page.request.get('/api/snapshot')).json()
  await expect(dots).toHaveAttribute('data-vehicles', String(snap.trips.filter((t: any) => !t.cancelled).length))
  await expect(page.getByRole('button', { name: '3D view' })).toHaveCount(0)
  await step('tilted link on phone')
}
