import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { expectAllDrawn, map, mapParam, opened } from './helpers.ts'

// Pass rule: a link with an out-of-range tilt or heading still opens a map, the bad value ignored or
// clamped; a place the checks refuse is no place, as today.
export default async ({ page, step, expect }: Journey) => {
  const attrs = async () => [await map(page).getAttribute('data-tilt'), await map(page).getAttribute('data-heading')]

  await opened({ page, expect }, '/en?map=14.00/55.67600/12.56800/-30.0/75.0')
  await expect(map(page)).toHaveAttribute('data-heading', '-30', { timeout: 20000 })
  await expect(map(page)).toHaveAttribute('data-tilt', /^(0|60)$/)
  await page.waitForTimeout(1500)
  await expectAllDrawn({ page, expect })
  console.log('tilt 75 ->', await attrs(), 'map=', mapParam(page))
  await step('tilt 75 out of range: map opens, heading -30 kept')

  await opened({ page, expect }, '/en?map=14.00/55.67600/12.56800/200.0/40.0')
  await expect(map(page)).toHaveAttribute('data-tilt', '40', { timeout: 20000 })
  await expect(map(page)).toHaveAttribute('data-heading', /^(0|180|-180|-160)$/)
  await page.waitForTimeout(1500)
  await expectAllDrawn({ page, expect })
  console.log('heading 200 ->', await attrs(), 'map=', mapParam(page))
  await step('heading 200 out of range: map opens, tilt 40 kept')

  await opened({ page, expect }, '/en?map=14.00/95.00000/12.56800/-30.0/50.0')
  await expect(map(page)).toHaveAttribute('data-tilt', '0', { timeout: 20000 })
  await expect(map(page)).toHaveAttribute('data-heading', '0')
  await page.waitForTimeout(1500)
  await expectAllDrawn({ page, expect })
  console.log('lat 95 ->', await attrs(), 'map=', mapParam(page))
  expect(mapParam(page) ?? '').not.toContain('95.0')
  await step('latitude 95 refused: map opens at home, flat north-up')

  await opened({ page, expect }, '/en?map=14.00/95.00000/12.56800')
  await page.waitForTimeout(1500)
  console.log('lat 95 three-part ->', await attrs(), 'map=', mapParam(page))
  await step('three-part latitude 95, for comparison')
}
