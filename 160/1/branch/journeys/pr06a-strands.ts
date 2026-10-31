import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { map, focusMap, press, camera, snapshot, centreOnTrip } from './lib.ts'
// Visual: centred on S-tog and Metro trains on the central corridors, flat, tilted 40 and tilted+turned -45: each dot on its line's strand.
export default async ({ page, step, expect }: Journey) => {
  const snap = await snapshot(page)
  const central = (t: any) => t.position[0] > 55.64 && t.position[0] < 55.73 && t.position[1] > 12.52 && t.position[1] < 12.61
  const trips = [
    ...snap.trips.filter((t: any) => t.mode === 's-tog' && central(t)).slice(0, 2),
    snap.trips.find((t: any) => t.mode === 'metro' && central(t)),
  ].filter(Boolean)
  for (const t of trips) {
    console.log('trip', t.key, t.line, t.position)
    await centreOnTrip(page, expect, t.key, 4)
    await step(`${t.line} flat`)
    await focusMap(page)
    await press(page, 'Shift+ArrowUp', 4, 700)
    await expect(map(page)).toHaveAttribute('data-tilt', '40', { timeout: 10000 })
    await page.waitForTimeout(1500)
    await step(`${t.line} tilted 40`)
    await press(page, 'Shift+ArrowLeft', 3, 700)
    await expect(map(page)).toHaveAttribute('data-heading', '-45', { timeout: 10000 })
    await page.waitForTimeout(1500)
    await step(`${t.line} tilted 40 turned -45`)
    console.log(JSON.stringify(await camera(page)))
  }
}
