// On the weekday recording (no delays) the pulse keeps its live figures; no "With delays" region.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await expect(sheet.getByRole('group', { name: 'On the move' })).toContainText(/\d/)
  await expect(sheet.getByRole('region', { name: 'With delays, by mode' })).toHaveCount(0)
  console.log('groups', JSON.stringify(await sheet.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent?.slice(0, 40)))))
  console.log('regions', JSON.stringify(await sheet.getByRole('region').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))))
  await step('pulse on weekday')
  await page.goto('/da')
  const da = page.getByRole('dialog', { name: 'Overblik' })
  await expect(da.getByRole('group').first()).toBeVisible()
  await expect(da.getByRole('region', { name: 'Med forsinkelser, efter transportform' })).toHaveCount(0)
  await step('pulse on weekday, danish')
}
