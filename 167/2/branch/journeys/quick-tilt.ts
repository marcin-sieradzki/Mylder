import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { keyboard } from './keys.ts'

// Pass rule: with the map focused, three quick presses of Shift + Up from flat settle at a 30° tilt.
// The presses go 60 ms apart, well under the 300 ms ease, without waiting for the slow renderer.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  const map = page.locator('[data-vehicles]')
  await expect(map).toHaveAttribute('data-tilt', '0', { timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  await step('flat, map focused')
  const keys = await keyboard(page)
  const t0 = Date.now()
  await keys.quick('ArrowUp', 3, 60)
  console.log(`three presses sent and handled in ${Date.now() - t0} ms`)
  await page.waitForTimeout(4000)
  await step('after three quick Shift+Up')
  console.log(`settled tilt ${await map.getAttribute('data-tilt')}, heading ${await map.getAttribute('data-heading')}, url ${page.url()}`)
  await expect(map).toHaveAttribute('data-tilt', '30', { timeout: 10_000 })
  await expect(map).toHaveAttribute('data-heading', '0')
  await expect(page.getByText(/\d+\s(m|km)$/)).toBeHidden()
  await expect(page).toHaveURL(/map=[\d.]+\/[\d.]+\/[\d.]+\/0\.0\/30\.0/)
  await page.waitForTimeout(2000)
  await expect(map).toHaveAttribute('data-tilt', '30')
  await step('rests at 30 tilt')
}
