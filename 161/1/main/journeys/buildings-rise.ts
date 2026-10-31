import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, sleep, tiltTo, zoomOf } from './lib.ts'
// Pass rule 1 (light): at zoom 14 and closer a tilted map shows buildings rising; below 14 flat footprints.
export default async ({ page, step, expect }: Journey) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/en?map=16.00/55.6800/12.5760')
  await ready(page, expect)
  await sleep(6000)
  await step('flat at zoom 16, inner city')
  await tiltTo(page, 6)
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-tilt', '60', { timeout: 15000 })
  await sleep(8000)
  await step('tilted 60 at zoom 16, buildings should rise')
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await sleep(1500)
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await sleep(8000)
  await step(`tilted at zoom ${zoomOf(page)}, buildings should still rise`)
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await sleep(8000)
  expect(zoomOf(page)).toBeLessThan(14)
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-tilt', '60')
  await step(`tilted at zoom ${zoomOf(page)}, buildings should be flat footprints`)
}
