import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, region } from './lib.ts'

// Regression, moving-map map-3d "Turn and tilt by a right-drag".
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  const v = page.locator('[data-vehicles]')
  const scale = page.getByText(/\d+\s(m|km)$/)
  await step('flat')
  const box = (await region(page).boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x + 150, y, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await expect(v).not.toHaveAttribute('data-heading', '0', { timeout: 15000 })
  await expect(v).toHaveAttribute('data-tilt', '0')
  await expect(scale).toBeVisible()
  await step('turned by right-drag')
  const heading = await v.getAttribute('data-heading')
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x, y - 60, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await expect(v).not.toHaveAttribute('data-tilt', '0', { timeout: 15000 })
  await expect(v).toHaveAttribute('data-heading', heading!)
  await expect(scale).toBeHidden()
  await page.waitForTimeout(1500)
  await step('tilted by right-drag')
}
