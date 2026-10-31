import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, map, focusMap, press, camera, aircraft, viewportMiddle, around, findPlanes } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  const a = await aircraft(page)
  const p = a.aircraft.filter((x: any) => x.state === 'live' && x.callsign)
    .sort((x: any, y: any) => Math.hypot(x.lat - 55.68, x.lon - 12.57) - Math.hypot(y.lat - 55.68, y.lon - 12.57))[0]
  console.log('plane', JSON.stringify(p))
  await page.goto(`/en?map=12.00/${p.lat.toFixed(5)}/${p.lon.toFixed(5)}`)
  await ready(page, expect)
  await page.getByRole('button', { name: 'Pause' }).click()
  await focusMap(page)
  await press(page, 'Shift+ArrowUp', 4, 700)
  await press(page, 'Shift+ArrowLeft', 3, 700)
  await expect(map(page)).toHaveAttribute('data-tilt', '40', { timeout: 10000 })
  await expect(map(page)).toHaveAttribute('data-heading', '-45', { timeout: 10000 })
  await page.waitForTimeout(1500)
  await step(`tilted 40, turned -45, near plane ${p.callsign}`)
  const mid = viewportMiddle(page)
  const tip = page.getByRole('tooltip')
  let hit: { x: number; y: number } | undefined
  let name = ''
  await expect(async () => {
    const blobs = await findPlanes(page, mid)
    console.log('planes seen at', JSON.stringify(blobs.slice(0, 3).map((b) => [Math.round(b.x), Math.round(b.y), b.n])))
    const b = blobs[0]
    if (!b) throw new Error('no plane drawn')
    for (const q of around(b.x, b.y, 6, 3)) {
      await page.mouse.move(q.x, q.y)
      await page.waitForTimeout(60)
      if (await tip.isVisible()) { hit = q; name = await tip.innerText(); return }
    }
    throw new Error(`no card at the plane drawn at ${Math.round(b.x)},${Math.round(b.y)}`)
  }).toPass({ timeout: 30000 })
  console.log('hover hit at', JSON.stringify(hit), name)
  await step('hover: card for the plane pointed at')
  expect(name).toContain(p.callsign)
  await page.mouse.click(hit!.x, hit!.y)
  await expect(page.getByRole('dialog', { name: p.callsign })).toBeVisible({ timeout: 10000 })
  await expect(page).toHaveURL(new RegExp(`aircraft=${p.hex}`))
  await step('tap: its panel, ?aircraft= in the address')
  console.log(JSON.stringify(await camera(page)))
}
