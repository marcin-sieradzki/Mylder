import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// stop-arrivals by link and keys, desktop: Refshaleøen until 07:26.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=48645&board=arrivals')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  const arrivals = panel.getByRole('tab', { name: 'Arrivals' })
  await expect(arrivals).toHaveAttribute('aria-selected', 'true')
  const row = panel.getByRole('list', { name: 'Arrivals' }).getByRole('listitem').filter({ hasText: 'From Orientkaj St.' })
  await expect(row).toContainText('991')
  await expect(row.getByRole('button', { name: 'Bus 991 from Orientkaj St.' })).toBeVisible()
  await step('arrivals by link')
  await arrivals.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(panel.getByRole('tab', { name: 'Departures' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).not.toHaveURL(/board=/)
  await expect(panel.getByRole('tab', { name: 'Departures' })).toHaveAttribute('aria-selected', 'true')
  await step('Departures by keys')
}
