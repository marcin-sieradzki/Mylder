import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { atRest, opened, press } from './helpers.ts'

// map-3d: tilted and turned, a bus's dot is on its line, hover shows its card, a click opens its panel.
export default async ({ page, step, expect }: Journey) => {
  const s = await (await page.request.get('/api/snapshot')).json()
  const trip = s.trips.find((t: { mode: string }) => t.mode === 'bus')
  const [lat, lon] = trip.position
  await opened({ page, expect }, `/en?map=15.00/${lat.toFixed(5)}/${lon.toFixed(5)}`)
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  await press(page, 'Shift+ArrowUp', 4)
  await press(page, 'Shift+ArrowLeft', 3)
  await atRest({ page, expect }, '40', '-45')
  await page.waitForTimeout(1500)
  await step('tilted 40, turned -45, centred on the bus')
  const v = page.viewportSize()!
  const pts: [number, number][] = []
  for (let r = 0; r <= 40; r += 6) for (let a = 0; a < 360; a += r ? 30 : 360) pts.push([v.width / 2 + r * Math.cos(a * Math.PI / 180), v.height / 2 + r * Math.sin(a * Math.PI / 180)])
  let hit: [number, number] | undefined
  await expect(async () => {
    for (const p of pts) {
      await page.mouse.move(...p)
      await page.waitForTimeout(60)
      if (await page.getByRole('tooltip').isVisible().catch(() => false)) { hit = p; break }
    }
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 500 })
  }).toPass({ timeout: 40000 })
  await expect(page.getByRole('tooltip')).toContainText(trip.line)
  console.log('tooltip at', hit, await page.getByRole('tooltip').innerText())
  await step('hover card in 3D')
  await page.mouse.click(...hit!)
  await expect(page).toHaveURL(/[?&]trip=/, { timeout: 20000 })
  await page.waitForTimeout(1000)
  console.log('url', page.url())
  await step('panel opened from a tilted tap')
}
