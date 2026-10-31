import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  await page.getByRole('link', { name: 'Rejseplanen' }).click()
  await expect(page.getByRole('dialog', { name: 'About Mylder' })).toBeVisible()
  await step('About from the credit (phone)')
}
