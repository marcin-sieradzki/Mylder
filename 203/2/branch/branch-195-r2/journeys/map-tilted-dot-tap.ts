import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  const bus = snap.trips.find((t: { mode: string; state: string }) => t.mode === 'bus' && t.state !== 'cancelled' && t.state !== 'waiting')
  const [lat, lon] = bus.position
  await page.goto(`/en?map=15.00/${lat.toFixed(5)}/${lon.toFixed(5)}`)
  const v = page.locator('[data-vehicles]')
  await expect(v).not.toHaveAttribute('data-vehicles', '0', { timeout: 20000 })
  await page.getByRole('button', { name: 'Pause' }).click()
  await step('centred on a bus, paused')
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowUp')
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft')
  await expect(v).toHaveAttribute('data-tilt', '40')
  await expect(v).toHaveAttribute('data-heading', '-45')
  await step('tilted and turned')
  const vp = page.viewportSize()!
  const cx = vp.width / 2, cy = vp.height / 2
  const pts: [number, number][] = []
  for (let r = 0; r <= 40; r += 4) for (let a = 0; a < 360; a += r === 0 ? 360 : 30) pts.push([cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)])
  let hit: [number, number] | null = null
  for (const [x, y] of pts) {
    await page.mouse.move(x, y)
    if (await page.getByRole('tooltip').isVisible().catch(() => false)) { hit = [x, y]; break }
    await page.waitForTimeout(60)
  }
  if (!hit) throw new Error('no tooltip within 40 px of the middle')
  await expect(page.getByRole('tooltip')).toBeVisible()
  await step('hover card')
  await page.mouse.click(hit[0], hit[1])
  await expect(page).toHaveURL(/[?&]trip=/)
  await step('panel open')
}
