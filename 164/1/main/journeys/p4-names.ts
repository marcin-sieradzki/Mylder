import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { controlNames, mapEl, toolbar } from './_common.ts'

// Pass rule 4: the toggle is a 3D button with its pressed state, the compass "Reset to north", in English and Danish.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(mapEl(page)).toBeAttached()
  await expect(toolbar(page)).toBeVisible()
  const en = await controlNames(page)
  console.log('en controls', JSON.stringify(en))
  console.log('en aria', await toolbar(page).ariaSnapshot())
  await expect(toolbar(page).getByRole('button', { name: /3D/, pressed: false })).toBeVisible({ timeout: 5000 })
  await expect(toolbar(page).getByRole('button', { name: 'Reset to north', exact: true })).toBeVisible()
  await step('english controls')
  await page.goto('/da')
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await expect(mapEl(page)).toBeAttached()
  const da = await controlNames(page)
  console.log('da controls', JSON.stringify(da))
  console.log('da aria', await toolbar(page).ariaSnapshot())
  const toggleDa = toolbar(page).getByRole('button', { name: /3D/, pressed: false })
  await expect(toggleDa).toBeVisible({ timeout: 5000 })
  const toggleNameDa = (await toggleDa.getAttribute('aria-label')) ?? (await toggleDa.textContent())
  const toggleEn = en.find((b) => /3D/.test(b.name))!
  console.log('toggle en/da', toggleEn.name, '/', toggleNameDa)
  const compassDa = toolbar(page).getByRole('button', { name: /nord/i })
  await expect(compassDa).toBeVisible()
  console.log('compass da', await compassDa.getAttribute('aria-label'))
  expect(da.some((b) => b.name === 'Reset to north')).toBe(false)
  await step('danish controls')
  await toggleDa.click()
  await expect(toolbar(page).getByRole('button', { name: /3D/, pressed: true })).toBeVisible({ timeout: 15000 })
  console.log('da aria pressed', await toolbar(page).ariaSnapshot())
  await step('danish toggle pressed')
}
