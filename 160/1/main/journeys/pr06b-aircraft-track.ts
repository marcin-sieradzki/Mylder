import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, map, focusMap, press, camera, aircraft } from './lib.ts'
// Visual: a plane at zoom 12, flat, then turned 90 and tilted 30: its glyph points along track minus heading.
export default async ({ page, step, expect }: Journey) => {
  const a = await aircraft(page)
  const p = a.aircraft.filter((x: any) => x.state === 'live' && x.altitude !== 'ground' && x.speed > 150)
    .sort((x: any, y: any) => Math.hypot(x.lat - 55.68, x.lon - 12.56) - Math.hypot(y.lat - 55.68, y.lon - 12.56))[0]
  console.log('plane', JSON.stringify(p))
  await page.goto(`/en?map=12.00/${p.lat.toFixed(5)}/${p.lon.toFixed(5)}`)
  await ready(page, expect)
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(1500)
  await step(`plane ${p.callsign} track ${Math.round(p.track)} flat north-up`)
  await focusMap(page)
  await press(page, 'Shift+ArrowRight', 6, 700)
  await expect(map(page)).toHaveAttribute('data-heading', '90', { timeout: 10000 })
  await page.waitForTimeout(1500)
  await step(`plane ${p.callsign} track ${Math.round(p.track)} turned 90 flat`)
  await press(page, 'Shift+ArrowUp', 3, 700)
  await expect(map(page)).toHaveAttribute('data-tilt', '30', { timeout: 10000 })
  await page.waitForTimeout(1500)
  await step(`plane ${p.callsign} track ${Math.round(p.track)} turned 90 tilted 30`)
  console.log(JSON.stringify(await camera(page)))
}
