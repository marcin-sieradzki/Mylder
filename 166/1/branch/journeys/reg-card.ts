import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Regression, moving map: map-card, hovering a dot shows its line, destination and state.
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  const trip = snap.trips.find((t: { mode: string; position?: number[] }) => t.mode === 'bus' && t.position)
  const [lat, lon] = trip.position
  await page.goto(`/en?map=15.00/${lat}/${lon}`)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(3000)
  await step('paused on the bus')
  const box = (await page.getByRole('region', { name: 'Live map of Copenhagen' }).boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const offsets: [number, number][] = []
  for (let dy = -80; dy <= 80; dy += 5) for (let dx = -80; dx <= 80; dx += 5) offsets.push([dx, dy])
  offsets.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))
  const tip = page.getByRole('tooltip')
  let text = ''
  for (const [dx, dy] of offsets) {
    await page.mouse.move(cx + dx, cy + dy)
    await page.waitForTimeout(60)
    if (await tip.isVisible().catch(() => false)) { text = await tip.innerText(); if (text.includes(trip.line)) break }
  }
  console.log(`card: ${text}`)
  expect(text).toContain(trip.line)
  expect(text).toContain(trip.headsign)
  await step('card')
}
