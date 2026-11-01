// Regression, moving-map map-chrome and language-and-about about-open on the weekday recording (no delays):
// the corner credit and About name no delays.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  const link = page.getByRole('link', { name: 'Rejseplanen' })
  await expect(link).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })).toBeVisible()
  const credit = link.locator('xpath=..')
  console.log('credit', JSON.stringify(await credit.innerText()))
  await expect(page.getByText(/Rejsekort/)).toHaveCount(0)
  await step('map chrome, credit without delays')
  await page.getByRole('button', { name: 'About Mylder' }).click()
  const about = page.getByRole('dialog', { name: 'About Mylder' })
  await expect(about).toBeVisible()
  const t = await about.innerText()
  console.log('about', JSON.stringify(t.slice(0, 3000)))
  expect(t).not.toMatch(/Rejsekort|SIRI-ET/)
  await step('about without delays')
  await page.keyboard.press('Escape')
  await expect(about).toBeHidden()
  await step('about closed')
  await link.click()
  await expect(about).toBeVisible()
  await step('about from the credit')
}
