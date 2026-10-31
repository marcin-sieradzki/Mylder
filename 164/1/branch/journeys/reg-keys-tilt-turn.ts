import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { atRest, expectAllDrawn, mapParam, opened, press, scale } from './helpers.ts'

// map-3d: tilt and turn by keys, Centre the map.
export default async ({ page, step, expect }: Journey) => {
  await opened({ page, expect }, '/en')
  await atRest({ page, expect }, '0', '0')
  await step('flat')
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  await press(page, 'Shift+ArrowUp', 3)
  await press(page, 'Shift+ArrowRight', 2)
  await atRest({ page, expect }, '30', '30')
  await expect(scale(page)).toBeHidden()
  await expectAllDrawn({ page, expect })
  await page.waitForTimeout(800)
  console.log('map=', mapParam(page))
  await step('tilted 30 turned 30')
  await page.getByRole('button', { name: 'Centre the map' }).click()
  await atRest({ page, expect }, '0', '0')
  await expect(scale(page)).toBeVisible()
  await page.waitForTimeout(800)
  console.log('after centre map=', mapParam(page))
  await step('centred: flat north-up')
}
