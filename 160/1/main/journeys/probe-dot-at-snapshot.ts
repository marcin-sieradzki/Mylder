import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, snapshot, viewportMiddle, around } from './lib.ts'
// Flat: is a bus's dot within 40 px of its /api/snapshot position at zoom 15? (the feature map's recipe precondition)
export default async ({ page, step, expect }: Journey) => {
  const snap = await snapshot(page)
  const t = snap.trips.find((x: any) => x.mode === 'bus' && x.position[0] > 55.66 && x.position[0] < 55.70 && x.position[1] > 12.55) ?? snap.trips.find((x: any) => x.mode === 'bus')
  console.log('bus', t.key, t.line, t.headsign, t.position, 'snapshot fetched', snap.fetched)
  await page.goto(`/en?map=15.00/${t.position[0].toFixed(5)}/${t.position[1].toFixed(5)}`)
  await ready(page, expect)
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(1000)
  await step('flat, centred on the snapshot position, paused')
  const { x, y } = viewportMiddle(page)
  const tip = page.getByRole('tooltip')
  let hit
  for (const p of around(x, y, 40, 4)) {
    await page.mouse.move(p.x, p.y)
    await page.waitForTimeout(40)
    if (await tip.isVisible() && (await tip.innerText()).includes(t.headsign)) { hit = p; break }
  }
  console.log('hit', JSON.stringify(hit))
  await step('searched')
  if (!hit) throw new Error('dot not within 40 px of its snapshot position')
}
