import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { atRest, expectAllDrawn, mapParam, opened, scale } from './helpers.ts'

// Pass rule: an older three-part link opens flat and north-up at that place.
export default async ({ page, step, expect }: Journey) => {
  await opened({ page, expect }, '/en?map=14.00/55.67600/12.56800')
  await atRest({ page, expect }, '0', '0')
  await page.waitForTimeout(1000)
  await expect(scale(page)).toBeVisible()
  expect(mapParam(page)).toBe('14.00/55.67600/12.56800')
  await expectAllDrawn({ page, expect })
  await step('three-part link: flat, north-up, at the place')
}
