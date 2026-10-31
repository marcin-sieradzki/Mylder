import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, region, sleep } from './lib.ts'
// Regression, moving-map map-3d: a right-drag turns and tilts.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  const v = page.locator('[data-vehicles]')
  const scale = page.getByText(/\d+\s(m|km)$/)
  await step('flat')
  const box = (await region(page).boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
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
  await sleep(2000)
  await step('tilted by right-drag')
}
