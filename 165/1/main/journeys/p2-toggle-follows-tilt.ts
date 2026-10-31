import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { keys, mapEl, pause, region, toolbar } from './_common.ts'

// Pass rule 2: tilting by keys, a right-drag or a tilted link shows the toggle pressed; flattening shows it unpressed.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(mapEl(page)).toHaveAttribute('data-tilt', '0')
  const toggle = toolbar(page).getByRole('button', { name: /3D/ })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 })
  await step('flat')
  await region(page).focus()
  await keys(page, 'Shift+ArrowUp', 3)
  await expect(mapEl(page)).toHaveAttribute('data-tilt', '30', { timeout: 10000 })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await step('tilted 30 by keys, toggle pressed')
  await keys(page, 'Shift+ArrowDown', 3)
  await expect(mapEl(page)).toHaveAttribute('data-tilt', '0', { timeout: 10000 })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await step('flat by keys, toggle unpressed')

  const box = (await region(page).boundingBox())!
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x, y - 60, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await expect(mapEl(page)).not.toHaveAttribute('data-tilt', '0', { timeout: 10000 })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  console.log('after right-drag tilt', await mapEl(page).getAttribute('data-tilt'))
  await step('tilted by right-drag, toggle pressed')
  await region(page).focus()
  for (let i = 0; i < 8 && (await mapEl(page).getAttribute('data-tilt')) !== '0'; i++) {
    await page.keyboard.press('Shift+ArrowDown')
    await pause(700)
  }
  await expect(mapEl(page)).toHaveAttribute('data-tilt', '0', { timeout: 10000 })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await step('flat again, toggle unpressed')

  await page.goto('/en?map=14.00/55.67600/12.56800/-30.0/50.0')
  await expect(mapEl(page)).toHaveAttribute('data-tilt', '50', { timeout: 15000 })
  await expect(toolbar(page).getByRole('button', { name: /3D/ })).toHaveAttribute('aria-pressed', 'true')
  await step('tilted link opens with toggle pressed')
}
