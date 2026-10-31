import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// stop-arrivals Metro interval, desktop: Bella Center St. until 07:26.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=8603313&board=arrivals')
  const list = page.getByRole('list', { name: 'Arrivals' })
  const row = list.getByRole('listitem').filter({ hasText: 'From Vanløse St.' })
  await expect(row).toContainText('M1')
  await expect(row).toContainText('Every 4 min')
  await expect(page.getByRole('dialog', { name: 'Bella Center St.' })).toContainText('Metro: planned times')
  await step('Metro arrivals interval')
}
