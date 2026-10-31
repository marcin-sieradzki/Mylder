import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, map, focusMap, press, camera } from './lib.ts'
// Visual: tilted 60, dots and planes near the foot against those near the top.
export default async ({ page, step, expect }: Journey) => {
  for (const view of ['12.50/55.66000/12.57000', '11.00/55.62000/12.50000']) {
    await page.goto(`/en?map=${view}`)
    await ready(page, expect)
    await page.getByRole('button', { name: 'Close' }).first().click() // the Overview sheet, out of the way
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.waitForTimeout(1500)
    await step(`${view} flat`)
    await focusMap(page)
    await press(page, 'Shift+ArrowUp', 6, 700)
    await expect(map(page)).toHaveAttribute('data-tilt', '60', { timeout: 10000 })
    await page.waitForTimeout(2000)
    await step(`${view} tilted 60`)
    console.log(JSON.stringify(await camera(page)))
  }
}
