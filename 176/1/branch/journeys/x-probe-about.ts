import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await page.getByRole('button', { name: 'About Mylder' }).click()
  const d = page.getByRole('dialog', { name: 'About Mylder' })
  await expect(d).toBeVisible(); await page.waitForTimeout(4000)
  console.log('ABOUT:\n' + (await d.innerText()))
  await step('about')
}
