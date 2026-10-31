import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { atRest, expectAllDrawn, mapParam, opened, press, scale } from './helpers.ts'

// Pass rules: tilting and turning writes the five-part address at rest; a reload keeps the tilt and
// heading; flat north-up writes the three-part form.
export default async ({ page, step, expect }: Journey) => {
  await opened({ page, expect }, '/en?map=13.00/55.67600/12.56800')
  await atRest({ page, expect }, '0', '0')
  expect(mapParam(page)).toBe('13.00/55.67600/12.56800')
  await step('flat north-up, three-part address')
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  await press(page, 'Shift+ArrowUp', 2)
  await press(page, 'Shift+ArrowRight', 2)
  await atRest({ page, expect }, '20', '30')
  await expect.poll(() => mapParam(page), { timeout: 10000 }).toBe('13.00/55.67600/12.56800/30.0/20.0')
  await expect(scale(page)).toBeHidden()
  await step('tilted 20 and turned 30 by keys, five-part address')
  await page.reload()
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 30000 })
  await atRest({ page, expect }, '20', '30')
  await page.waitForTimeout(1500)
  expect(mapParam(page)).toBe('13.00/55.67600/12.56800/30.0/20.0')
  await expectAllDrawn({ page, expect })
  await step('after reload: same tilt and heading')
  await page.getByRole('button', { name: 'Centre the map' }).click()
  await atRest({ page, expect }, '0', '0')
  await expect.poll(() => mapParam(page)?.split('/').length, { timeout: 10000 }).toBe(3)
  await expect(scale(page)).toBeVisible()
  console.log('after centre map=', mapParam(page))
  await step('centre the map: flat north-up, three-part address')
}
