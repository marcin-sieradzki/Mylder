import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await expect(sheet.getByRole('group', { name: 'On the move' })).toContainText(/\d/)
  await step('pulse')
  await sheet.getByRole('tab', { name: /^Vehicles/ }).click()
  await expect(page).toHaveURL(/tab=vehicles/)
  const table = sheet.getByRole('table', { name: 'Vehicles' })
  await expect.poll(async () => (await table.getByRole('row').count()) - 1).toBe(Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles')))
  await step('vehicles list')
  await sheet.getByLabel('Search lines and destinations').fill('5C')
  await expect.poll(async () => (await table.getByRole('row').count()) - 1).toBeGreaterThan(0)
  for (const r of await table.getByRole('row').all().then((rs) => rs.slice(1))) await expect(r).toContainText('5C')
  await step('search 5C')
  await sheet.getByLabel('Search lines and destinations').fill('zzz')
  await expect(sheet.getByText('No vehicles match.')).toBeVisible()
  await step('search zzz')
}
