import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { map, focusMap, press, camera, snapshot, viewportMiddle, around, centreOnTrip } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  const snap = await snapshot(page)
  const t = snap.trips.find((x: any) => x.mode === 'bus' && x.position[0] > 55.66 && x.position[0] < 55.70 && x.position[1] > 12.55) ?? snap.trips.find((x: any) => x.mode === 'bus')
  console.log('bus', t.key, t.line, t.headsign, t.position)
  await centreOnTrip(page, expect, t.key, 4)
  await step('bus centred by Follow, paused, zoomed in')
  await focusMap(page)
  await press(page, 'Shift+ArrowUp', 4, 700)
  await press(page, 'Shift+ArrowLeft', 3, 700)
  await expect(map(page)).toHaveAttribute('data-tilt', '40', { timeout: 10000 })
  await expect(map(page)).toHaveAttribute('data-heading', '-45', { timeout: 10000 })
  await page.waitForTimeout(1500)
  await step('tilted 40, turned -45')
  const { x, y } = viewportMiddle(page)
  const tip = page.getByRole('tooltip')
  let hit: { x: number; y: number } | undefined
  for (const p of around(x, y, 40, 4)) {
    await page.mouse.move(p.x, p.y)
    await page.waitForTimeout(60)
    if (await tip.isVisible() && (await tip.innerText()).includes(t.headsign)) { hit = p; break }
  }
  if (!hit) throw new Error(`no tooltip for ${t.line} to ${t.headsign} within 40 px of the middle`)
  console.log('hover hit at', JSON.stringify(hit), 'offset', Math.round(hit.x - x), Math.round(hit.y - y), await tip.innerText())
  await step('hover: card for the bus pointed at')
  await expect(tip).toContainText(t.line)
  await page.mouse.click(hit.x, hit.y)
  const panel = page.getByRole('dialog', { name: new RegExp(`to ${t.headsign}`) })
  await expect(panel).toBeVisible({ timeout: 10000 })
  expect(new URL(page.url()).searchParams.get('trip')).toBe(t.key)
  await step('tap: its panel, ?trip= in the address')
  console.log(JSON.stringify(await camera(page)))
}
