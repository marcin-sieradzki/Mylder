import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, map, focusMap, press, camera, viewportMiddle, around } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?map=15.00/55.69250/12.58779') // Østerport St.
  await ready(page, expect)
  await focusMap(page)
  await press(page, 'Shift+ArrowUp', 4, 700)
  await press(page, 'Shift+ArrowLeft', 3, 700)
  await expect(map(page)).toHaveAttribute('data-tilt', '40', { timeout: 10000 })
  await expect(map(page)).toHaveAttribute('data-heading', '-45', { timeout: 10000 })
  await page.waitForTimeout(1500)
  await step('tilted 40, turned -45 on Østerport St.')
  const { x, y } = viewportMiddle(page)
  const panel = page.getByRole('dialog', { name: 'Østerport St.' })
  let hit
  for (const q of around(x, y, 12, 4)) {
    await page.mouse.click(q.x, q.y)
    await page.waitForTimeout(400)
    if (await panel.isVisible()) { hit = q; break }
    if (await page.getByRole('dialog', { name: / to / }).isVisible()) { await page.keyboard.press('Escape'); await focusMap(page) }
  }
  if (!hit) throw new Error('no Østerport St. panel from a tap within 12 px of the middle')
  console.log('tap hit at', JSON.stringify(hit))
  await expect(page).toHaveURL(/stop=/)
  await expect(panel.getByRole('list', { name: 'Departures' })).toBeVisible()
  await step('tap: Østerport St. departures, ?stop= in the address')
  console.log(JSON.stringify(await camera(page)))
}
