import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { atRest, expectAllDrawn, mapParam, opened, scale } from './helpers.ts'

// Pass rule: opening a five-part link opens the map at that tilt and heading (desktop; phone with --phone).
export default async ({ page, step, expect }: Journey) => {
  await step('before opening the tilted link')
  await opened({ page, expect }, '/en?map=14.00/55.67600/12.56800/-30.0/50.0')
  await atRest({ page, expect }, '50', '-30')
  await page.waitForTimeout(1500)
  await step('tilted link opened: tilt 50, heading -30')
  await expect(scale(page)).toBeHidden()
  await expectAllDrawn({ page, expect })
  console.log('address map=', mapParam(page))
  expect(mapParam(page)).toMatch(/^14\.00\/55\.676\d*\/12\.568\d*\/-30\.0\/50\.0$/)
  await step('every vehicle drawn, address keeps the angle')
}
