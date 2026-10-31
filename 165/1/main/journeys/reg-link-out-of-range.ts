import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { expectAllDrawn, map, mapParam, opened } from './helpers.ts'

// map-3d (feature map recipe): a tilt out of range opens the map at heading -30, flat, every dot drawn.
export default async ({ page, step, expect }: Journey) => {
  await opened({ page, expect }, '/en?map=14.00/55.67600/12.56800/-30.0/75.0')
  await expect(map(page)).toHaveAttribute('data-heading', '-30', { timeout: 20000 })
  await expect(map(page)).toHaveAttribute('data-tilt', '0')
  await expectAllDrawn({ page, expect })
  console.log('map=', mapParam(page))
  await step('tilt 75 out of range: heading -30, flat, every dot drawn')
}
