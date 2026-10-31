import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Regression, vehicle-detail trip-open (list), trip-facts, trip-close, trip-missing.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await sheet.getByRole('tab', { name: /^Vehicles/ }).click()
  const table = page.getByRole('table', { name: 'Vehicles' })
  await expect(table).toBeVisible()
  await step('vehicles list')
  await table.getByRole('link').first().click()
  const panel = page.getByRole('dialog', { name: / to / })
  await expect(panel).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=/)
  for (const t of ['Delay', 'Last seen', 'Next stop']) await expect(panel.getByText(t, { exact: true }).first()).toBeVisible()
  await expect(panel.getByRole('list', { name: 'Stops' })).toBeVisible()
  await step('trip panel with facts')
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page).not.toHaveURL(/[?&]trip=/)
  await step('closed')
  await page.goto('/en?trip=nothing')
  await expect(page.getByRole('dialog', { name: 'Trip not found' })).toBeVisible()
  await step('trip not found')
}
