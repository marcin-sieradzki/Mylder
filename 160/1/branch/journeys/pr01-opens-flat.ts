import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, map, scale, camera } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  await page.waitForTimeout(2000)
  await step('opened: flat and north-up')
  await expect(scale(page)).toBeVisible()
  const c = await camera(page)
  console.log('camera at open', JSON.stringify(c))
  // On the branch the camera reads back tilt and heading; on main they don't exist (flat, north-up only).
  if (c.tilt !== null) expect(c.tilt).toBe('0')
  if (c.heading !== null) expect(c.heading).toBe('0')
}
