import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { opened } from './helpers.ts'

// map-card: hover a dot.
export default async ({ page, step, expect }: Journey) => {
  const s = await (await page.request.get('/api/snapshot')).json()
  const trip = s.trips.find((t: { mode: string }) => t.mode === 'bus')
  const [lat, lon] = trip.position
  await opened({ page, expect }, `/en?map=15.00/${lat.toFixed(5)}/${lon.toFixed(5)}`)
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(1500)
  await step('centred on a bus, paused')
  const v = page.viewportSize()!
  const pts: [number, number][] = []
  for (let r = 0; r <= 40; r += 8) for (let a = 0; a < 360; a += r ? 45 : 360) pts.push([v.width / 2 + r * Math.cos(a * Math.PI / 180), v.height / 2 + r * Math.sin(a * Math.PI / 180)])
  await expect(async () => {
    for (const [x, y] of pts) {
      await page.mouse.move(x, y)
      if (await page.getByRole('tooltip').isVisible().catch(() => false)) break
      await page.waitForTimeout(60)
    }
    await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 500 })
  }).toPass({ timeout: 30000 })
  await expect(page.getByRole('tooltip')).toContainText(trip.line)
  console.log('tooltip:', await page.getByRole('tooltip').innerText())
  await step('hover card shows the line')
}
