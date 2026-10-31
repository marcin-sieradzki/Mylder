import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { region } from './lib.ts'

// Regression, moving-map map-3d "Tilted, a dot on its line and a tap": centre on a bus, pause,
// four Shift + Up and three Shift + Left, hover near the middle for its card, click for its panel.
export default async ({ page, step, expect }: Journey) => {
  const trips = (await (await page.request.get('/api/snapshot')).json()).trips
  const bus = trips.find((t: any) => t.mode === 'bus' && t.state !== 'cancelled')
  await page.goto(`/en?map=15.00/${bus.position[0]}/${bus.position[1]}`)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await page.getByRole('button', { name: 'Pause' }).click()
  await region(page).focus()
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowUp')
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft')
  const v = page.locator('[data-vehicles]')
  await expect(v).toHaveAttribute('data-tilt', '40', { timeout: 15000 })
  await expect(v).toHaveAttribute('data-heading', '-45', { timeout: 15000 })
  await page.waitForTimeout(1500)
  await step(`tilted 40, turned -45 on bus ${bus.line}`)
  const vp = page.viewportSize()!
  const cx = vp.width / 2
  const cy = vp.height / 2
  const points: [number, number][] = []
  for (let r = 0; r <= 40; r += 8) for (let a = 0; a < 360; a += r === 0 ? 360 : 45) points.push([cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)])
  let hit: [number, number] | undefined
  for (const [x, y] of points) {
    await page.mouse.move(x, y)
    if (await page.getByRole('tooltip').isVisible({ timeout: 400 }).catch(() => false)) {
      hit = [x, y]
      break
    }
    await page.waitForTimeout(250)
    if (await page.getByRole('tooltip').isVisible()) {
      hit = [x, y]
      break
    }
  }
  if (!hit) throw new Error('no card within 40 px of the middle on the tilted map')
  await expect(page.getByRole('tooltip')).toContainText(/Live|Estimated|Timetable|Ageing|No signal/)
  await step(`card: ${await page.getByRole('tooltip').textContent()}`)
  await page.mouse.click(hit[0], hit[1])
  await expect(page).toHaveURL(/[?&]trip=/, { timeout: 15000 })
  await step('panel open with ?trip=')
}
