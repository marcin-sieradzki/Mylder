import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// language-and-about `about-open` from the corner credit, on a phone, weekday recording.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByText('Recorded data from 16 June 2026.').first()).toBeVisible()
  await step('phone map')
  await page.getByRole('link', { name: 'Rejseplanen' }).first().click()
  await expect(page.getByRole('dialog', { name: 'About Mylder' })).toBeVisible()
  await step('About from the credit')
}
