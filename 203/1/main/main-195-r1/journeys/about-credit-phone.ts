import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 20000 })
  await step('phone map')
  await page.getByRole('link', { name: 'Rejseplanen' }).click()
  const d = page.getByRole('dialog', { name: 'About Mylder' })
  await expect(d).toBeVisible()
  await step('about from credit')
  await page.keyboard.press('Escape')
  await expect(d).toBeHidden()
}
