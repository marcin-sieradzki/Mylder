import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { controlNames, mapEl, toolbar } from './_common.ts'

// Pass rule 7 (run with --phone): neither the toggle nor the compass shows, flat or from a tilted link.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(mapEl(page)).toHaveAttribute('data-tilt', '0')
  await expect(toolbar(page)).toBeVisible()
  console.log('phone controls', JSON.stringify(await controlNames(page)))
  await expect(page.getByRole('button', { name: /3D/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /north/i })).toHaveCount(0)
  await step('phone flat, no toggle or compass')
  await page.goto('/en?map=14.00/55.67600/12.56800/-30.0/50.0')
  await expect(mapEl(page)).toHaveAttribute('data-tilt', '50', { timeout: 15000 })
  await expect(toolbar(page)).toBeVisible()
  console.log('phone tilted controls', JSON.stringify(await controlNames(page)))
  await expect(page.getByRole('button', { name: /3D/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /north/i })).toHaveCount(0)
  await step('phone tilted link, no toggle or compass')
}
