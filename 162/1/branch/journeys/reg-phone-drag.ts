import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { map, opened } from './helpers.ts'

// map-3d at phone size: a right-drag neither tilts nor turns.
export default async ({ page, step, expect }: Journey) => {
  await opened({ page, expect }, '/en')
  await expect(map(page)).toHaveAttribute('data-tilt', '0', { timeout: 20000 })
  const v = page.viewportSize()!
  const x = v.width / 2, y = v.height / 3
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x + 150, y - 60, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(2000)
  await expect(map(page)).toHaveAttribute('data-tilt', '0')
  await expect(map(page)).toHaveAttribute('data-heading', '0')
  await step('phone: right-drag left it flat and north-up')
}
