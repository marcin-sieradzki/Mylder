import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, map, focusMap, press, camera, snapshot, viewportMiddle, around } from './lib.ts'
// The feature map's recipe, literally: centre on a bus's snapshot position, pause, tilt 4 and turn 3 by keys, hover within 40 px, click.
export default async ({ page, step, expect }: Journey) => {
  const snap = await snapshot(page)
  const t = snap.trips.find((x: any) => x.mode === 'bus' && x.position[0] > 55.66 && x.position[0] < 55.70 && x.position[1] > 12.55) ?? snap.trips.find((x: any) => x.mode === 'bus')
  console.log('bus', t.key, t.line, t.headsign, t.position)
  await page.goto(`/en?map=15.00/${t.position[0].toFixed(5)}/${t.position[1].toFixed(5)}`)
  await ready(page, expect)
  await page.getByRole('button', { name: 'Pause' }).click()
  await focusMap(page)
  await press(page, 'Shift+ArrowUp', 4, 600)
  await press(page, 'Shift+ArrowLeft', 3, 600)
  await expect(map(page)).toHaveAttribute('data-tilt', '40', { timeout: 10000 })
  await expect(map(page)).toHaveAttribute('data-heading', '-45', { timeout: 10000 })
  await page.waitForTimeout(1000)
  await step('tilted and turned about the bus')
  const { x, y } = viewportMiddle(page)
  const tip = page.getByRole('tooltip')
  let hit: { x: number; y: number } | undefined
  for (const p of around(x, y, 40, 4)) {
    await page.mouse.move(p.x, p.y)
    await page.waitForTimeout(50)
    if (await tip.isVisible() && (await tip.innerText()).includes(t.headsign)) { hit = p; break }
  }
  if (!hit) throw new Error('no card within 40 px')
  console.log('hit', JSON.stringify(hit), await tip.innerText())
  await step('hover card')
  await page.mouse.click(hit.x, hit.y)
  await expect(page.getByRole('dialog', { name: new RegExp(`to ${t.headsign}`) })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('trip')).toBe(t.key)
  await step('panel')
  console.log(JSON.stringify(await camera(page)))
}
