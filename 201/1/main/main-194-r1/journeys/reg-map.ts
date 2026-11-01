import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '17', { timeout: 20000 })
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })).toBeVisible()
  await step('map drawn with 17 and chrome')
  const bus = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })
  await bus.click()
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '11')
  await expect(bus).toContainText('6')
  await step('buses filtered off')
  await bus.click()
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', '17')
  await step('buses back')
  const snap = await (await page.request.get('/api/snapshot')).json()
  const t = snap.trips.find((x: any) => x.mode === 'bus' && x.position)
  await page.goto(`/en?map=15.00/${t.position[0].toFixed(5)}/${t.position[1].toFixed(5)}`)
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 20000 })
  await page.getByRole('button', { name: 'Pause' }).click()
  await step('centred on a bus, paused')
  const vp = page.viewportSize()!
  const pts: [number, number][] = []
  for (let r = 0; r <= 130; r += 5) for (let a = 0; a < 360; a += r === 0 ? 360 : 15) pts.push([vp.width / 2 + r * Math.cos(a * Math.PI / 180), vp.height / 2 + r * Math.sin(a * Math.PI / 180)])
  let found = false
  for (const [x, y] of pts) {
    await page.mouse.move(x, y)
    if (await page.getByRole('tooltip').isVisible().catch(() => false)) { found = true; break }
    await page.waitForTimeout(20)
  }
  expect(found).toBe(true)
  await expect(page.getByRole('tooltip')).toBeVisible()
  await step('hover card')
}
