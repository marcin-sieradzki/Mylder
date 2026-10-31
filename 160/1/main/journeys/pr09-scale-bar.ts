import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, map, scale, focusMap, press, camera } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  await focusMap(page)
  await expect(scale(page)).toBeVisible()
  await step('flat: scale bar')
  await press(page, 'Shift+ArrowRight', 2, 700)
  await expect(map(page)).toHaveAttribute('data-heading', '30', { timeout: 10000 })
  await expect(scale(page)).toBeVisible()
  await step('turned 30, flat: scale bar shows')
  await press(page, 'Shift+ArrowUp', 2, 700)
  await expect(map(page)).toHaveAttribute('data-tilt', '20', { timeout: 10000 })
  await expect(scale(page)).toBeHidden()
  await step('tilted 20, turned: scale bar hidden')
  await press(page, 'Shift+ArrowDown', 2, 700)
  await expect(map(page)).toHaveAttribute('data-tilt', '0', { timeout: 10000 })
  await expect(map(page)).toHaveAttribute('data-heading', '30')
  await expect(scale(page)).toBeVisible()
  await step('flat again, still turned: scale bar back')
  console.log(JSON.stringify(await camera(page)))
}
