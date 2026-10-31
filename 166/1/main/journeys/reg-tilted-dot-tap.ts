import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Regression, moving map: tilted and turned (four Shift+Up, three Shift+Left), a bus dot on its
// line, its card on hover nearest the middle first, and its panel on a click.
export default async ({ page, step, expect }: Journey) => {
  const map = page.locator('[data-vehicles]')
  const snap = await (await page.request.get('/api/snapshot')).json()
  const trip = snap.trips.find((t: { mode: string; position?: number[] }) => t.mode === 'bus' && t.position)
  const [lat, lon] = trip.position
  await page.goto(`/en?map=15.00/${lat}/${lon}`)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Close' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Overview' })).toBeHidden()
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  for (const key of ['Shift+ArrowUp', 'Shift+ArrowUp', 'Shift+ArrowUp', 'Shift+ArrowUp', 'Shift+ArrowLeft', 'Shift+ArrowLeft', 'Shift+ArrowLeft']) {
    await page.keyboard.press(key)
    await page.waitForTimeout(500)
  }
  await expect(map).toHaveAttribute('data-tilt', '40', { timeout: 15000 })
  await expect(map).toHaveAttribute('data-heading', '-45', { timeout: 15000 })
  await page.waitForTimeout(6000)
  await step('tilted and turned on the bus')
  const tip = page.getByRole('tooltip')
  const offsets: [number, number][] = []
  for (let dy = -200; dy <= 200; dy += 6) for (let dx = -200; dx <= 200; dx += 6) offsets.push([dx, dy])
  offsets.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))
  let at: [number, number] | undefined
  let card = ''
  for (const [dx, dy] of offsets) {
    await page.mouse.move(640 + dx, 360 + dy)
    if (await tip.isVisible().catch(() => false)) { at = [640 + dx, 360 + dy]; card = await tip.innerText(); break }
  }
  console.log(`card at ${at}: ${card}`)
  expect(at, 'a card on hover near the middle').toBeDefined()
  expect(card).toMatch(/^Bus /)
  await step('card tilted')
  await page.mouse.click(at![0], at![1])
  await expect(page).toHaveURL(/trip=/, { timeout: 10000 })
  await step('panel open')
}
