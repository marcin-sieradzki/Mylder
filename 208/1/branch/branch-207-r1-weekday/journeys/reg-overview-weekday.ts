import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// overview-sheet `pulse-figures`, `list-rows`, `list-search`, `sheet-tabs` on the weekday recording.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByText('Recorded data from 16 June 2026.').first()).toBeVisible()
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await expect(sheet.getByRole('group', { name: 'On the move' })).toContainText(/\d/)
  await step('City pulse')
  await sheet.getByRole('tab', { name: /^Vehicles/ }).click()
  await expect(page).toHaveURL(/tab=vehicles/)
  const table = sheet.getByRole('table', { name: 'Vehicles' })
  await expect.poll(async () => {
    const drawn = Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles'))
    return (await table.getByRole('row').count()) - 1 - drawn
  }).toBe(0)
  await step('Vehicles list')
  await sheet.getByLabel('Search lines and destinations').fill('5C')
  const rows = table.getByRole('row')
  await expect(async () => {
    const n = await rows.count()
    expect(n).toBeGreaterThan(1)
    for (let i = 1; i < n; i++) await expect(rows.nth(i)).toContainText('5C', { timeout: 500 })
  }).toPass()
  await step('search 5C')
  await sheet.getByLabel('Search lines and destinations').fill('zzz')
  await expect(sheet.getByText('No vehicles match.')).toBeVisible()
  await step('search zzz')
}
