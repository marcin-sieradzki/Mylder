import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { atRest, mapParam, opened, press, scale } from './helpers.ts'

// Pass rule: a turned but flat map writes the five-part form; turned back to north it is three-part again.
export default async ({ page, step, expect }: Journey) => {
  await opened({ page, expect }, '/en?map=13.00/55.67600/12.56800')
  await atRest({ page, expect }, '0', '0')
  await step('flat north-up')
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  await press(page, 'Shift+ArrowRight', 2)
  await atRest({ page, expect }, '0', '30')
  await expect.poll(() => mapParam(page), { timeout: 10000 }).toBe('13.00/55.67600/12.56800/30.0/0.0')
  await expect(scale(page)).toBeVisible()
  await step('turned 30, flat: five-part address, scale bar shown')
  await press(page, 'Shift+ArrowLeft', 2)
  await atRest({ page, expect }, '0', '0')
  await expect.poll(() => mapParam(page), { timeout: 10000 }).toBe('13.00/55.67600/12.56800')
  await step('turned back to north: three-part address')
}
