import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, map, scale, focusMap, press, snapshot } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  await focusMap(page)
  await step('flat')
  await press(page, 'Shift+ArrowUp', 3, 600)
  await press(page, 'Shift+ArrowRight', 2, 600)
  await expect(map(page)).toHaveAttribute('data-tilt', '30', { timeout: 10000 })
  await expect(map(page)).toHaveAttribute('data-heading', '30', { timeout: 10000 })
  await page.waitForTimeout(1000)
  await step('tilted 30, turned 30')
  await expect(scale(page)).toBeHidden()
  const snap = await snapshot(page)
  expect(await map(page).getAttribute('data-vehicles')).toBe(String(snap.trips.filter((t: any) => t.state !== 'cancelled').length))
  await page.getByRole('button', { name: 'Centre the map' }).click()
  await expect(map(page)).toHaveAttribute('data-tilt', '0', { timeout: 10000 })
  await expect(map(page)).toHaveAttribute('data-heading', '0', { timeout: 10000 })
  await expect(scale(page)).toBeVisible()
  await page.waitForTimeout(1000)
  await step('Centre the map: flat, north-up, scale bar back')
}
