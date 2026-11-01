import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await expect(sheet).toBeVisible()
  await step('phone start')
  console.log((await page.locator('body').ariaSnapshot()).slice(0, 2500))
  console.log('vp', JSON.stringify(page.viewportSize()), 'sheet box', JSON.stringify(await sheet.boundingBox()))
}
