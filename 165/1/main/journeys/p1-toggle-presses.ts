import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { controlNames, mapEl, pause, scaleBar, toolbar } from './_common.ts'

// Pass rule 1: pressing the 3D toggle eases the map to about 50° and shows it pressed; again, flat and unpressed.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(mapEl(page)).toHaveAttribute('data-tilt', '0')
  await expect(scaleBar(page)).toBeVisible()
  console.log('controls:', JSON.stringify(await controlNames(page)))
  await step('flat, controls before')
  const toggle = toolbar(page).getByRole('button', { name: /3D/ })
  await expect(toggle).toBeVisible({ timeout: 5000 })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await pause(300)
  await step('just after pressing 3D')
  await expect(mapEl(page)).toHaveAttribute('data-tilt', /^(4[5-9]|5[0-5])$/, { timeout: 15000 })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(scaleBar(page)).toBeHidden()
  await expect(page).toHaveURL(/map=[\d.]+\/[\d.]+\/[\d.]+\/-?[\d.]+\/(4[5-9]|5[0-5])(\.\d)?$/)
  console.log('tilt', await mapEl(page).getAttribute('data-tilt'), page.url())
  await step('tilted, toggle pressed')
  await toggle.click()
  await expect(mapEl(page)).toHaveAttribute('data-tilt', '0', { timeout: 15000 })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(scaleBar(page)).toBeVisible()
  await step('flat again, toggle unpressed')
}
