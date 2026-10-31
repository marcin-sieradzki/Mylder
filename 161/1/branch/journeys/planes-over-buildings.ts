import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, sleep, tiltTo } from './lib.ts'
// Pass rule 3 (aircraft): planes stay visible over buildings in a tilted map.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  await expect.poll(async () => Number(await page.locator('[data-aircraft]').getAttribute('data-aircraft')), { timeout: 30000 }).toBeGreaterThan(0)
  const air = await (await page.request.get('/api/aircraft')).json()
  const list = (air.aircraft ?? air.planes ?? air)
  const dist = (p: any) => Math.hypot(p.lat - 55.676, (p.lon - 12.568) * 0.56)
  const plane = [...list].sort((a: any, b: any) => dist(a) - dist(b))[0]
  await page.goto(`/en?map=15.00/${plane.lat}/${plane.lon}`)
  await ready(page, expect)
  await page.getByRole('button', { name: 'Pause' }).click().catch(() => {})
  await sleep(4000)
  await step(`flat on plane ${plane.callsign ?? plane.hex}`)
  await tiltTo(page, 5)
  await sleep(8000)
  await expect.poll(async () => Number(await page.locator('[data-aircraft]').getAttribute('data-aircraft'))).toBeGreaterThan(0)
  await step('tilted 50 on the plane, buildings around')
}
