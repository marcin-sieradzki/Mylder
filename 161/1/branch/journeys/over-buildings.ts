import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, region, sleep, tiltTo } from './lib.ts'
// Pass rule 3: line paths and stops draw over the buildings; vehicles stay visible over them, tilted, and a tap still opens the right panel.
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  const bus = snap.trips.find((t: any) => t.mode === 'bus' && t.position[0] > 55.66 && t.position[0] < 55.70 && t.position[1] > 12.55)
    ?? snap.trips.find((t: any) => t.mode === 'bus')
  const [lat, lon] = bus.position
  await page.goto(`/en?map=15.00/${lat}/${lon}`)
  await ready(page, expect)
  await page.getByRole('button', { name: 'Pause' }).click()
  await sleep(5000)
  await step(`flat, paused, centred on bus ${bus.line}`)
  await tiltTo(page, 5)
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-tilt', '50', { timeout: 15000 })
  await sleep(8000)
  await step('tilted 50 over buildings: lines, stops and dots on top')
  const live = (await (await page.request.get('/api/snapshot')).json()).trips.filter((t: any) => t.state !== 'cancelled').length
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(live))
  const box = (await region(page).boundingBox())!
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const offsets: [number, number][] = [[0, 0]]
  for (let r = 8; r <= 120; r += 8) for (let a = 0; a < 360; a += 30) offsets.push([Math.round(r * Math.cos(a * Math.PI / 180)), Math.round(r * Math.sin(a * Math.PI / 180))])
  let hit: [number, number] | undefined
  await expect(async () => {
    for (const [dx, dy] of offsets) {
      await page.mouse.move(cx + dx, cy + dy)
      await sleep(60)
      if (await page.getByRole('tooltip').isVisible()) { hit = [cx + dx, cy + dy]; return }
    }
    throw new Error('no tooltip within 120 px of the centre')
  }).toPass({ timeout: 90000 })
  await expect(page.getByRole('tooltip')).toContainText(bus.line)
  await step('hover card over buildings')
  await page.mouse.click(hit![0], hit![1])
  await expect(page).toHaveURL(/trip=/, { timeout: 15000 })
  await sleep(2000)
  await step('panel open from a tap over buildings')
}
