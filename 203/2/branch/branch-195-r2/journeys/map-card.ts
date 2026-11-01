import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  const trip = snap.trips.find((t: { position?: unknown; state: string }) => t.position && t.state !== 'cancelled')
  const [lat, lon] = trip.position
  await page.goto(`/en?map=15.00/${lat.toFixed(5)}/${lon.toFixed(5)}`)
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 20000 })
  await page.getByRole('button', { name: 'Pause' }).click()
  await step('centred on trip')
  const box = (await page.getByRole('region', { name: 'Live map of Copenhagen' }).boundingBox())!
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const offsets: [number, number][] = [[0, 0]]
  for (let r = 4; r <= 40; r += 4) for (let a = 0; a < 8; a++) offsets.push([Math.round(r * Math.cos(a * Math.PI / 4)), Math.round(r * Math.sin(a * Math.PI / 4))])
  await expect(async () => {
    for (const [dx, dy] of offsets) {
      await page.mouse.move(cx + dx, cy + dy)
      if (await page.getByRole('tooltip').isVisible().catch(() => false)) return
    }
    throw new Error('no tooltip')
  }).toPass({ timeout: 20000 })
  await expect(page.getByRole('tooltip')).toContainText(trip.line ?? '')
  await step('hover card')
}
