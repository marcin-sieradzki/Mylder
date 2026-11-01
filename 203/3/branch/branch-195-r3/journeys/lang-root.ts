import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'da-DK,da;q=0.9' })
  await page.goto('/')
  await expect(page).toHaveURL(/\/da$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'da')
  await step('root to da')
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' })
  await page.goto('/')
  await expect(page).toHaveURL(/\/en$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await step('root to en')
}
