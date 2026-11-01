import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// overview-sheet: overview-timetable on the default source.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await expect(sheet).toBeVisible()
  await expect(async () => {
    const snap = await (await page.request.get('/api/snapshot')).json()
    await expect(sheet.getByRole('group', { name: 'On the move' })).toContainText(`of ${snap.trips.length} in service`, { timeout: 1000 })
  }).toPass({ timeout: 70000 })
  await expect(sheet.getByRole('region', { name: 'On the move, by mode' })).toBeVisible()
  await expect(sheet.getByRole('group', { name: 'Reported this minute' })).toContainText('No live positions yet; placed from the timetable')
  await expect(sheet.getByRole('group', { name: 'Reporting live' })).toContainText('No live positions yet; placed from the timetable')
  await expect(sheet.getByRole('group', { name: 'Average delay' })).toHaveCount(0)
  await expect(sheet.locator('time', { hasText: /^placed \d\d:\d\d:\d\d$/ }).first()).toBeVisible()
  await expect(sheet.getByText(/paused/i)).toHaveCount(0)
  await expect(sheet.getByText(/Rejseplanen ·/)).toHaveCount(0)
  await step('city pulse')
  await sheet.getByRole('tab', { name: /^Vehicles/ }).click()
  await expect(page).toHaveURL(/tab=vehicles/)
  const table = sheet.getByRole('table', { name: 'Vehicles' })
  await expect(table).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Delay' })).toHaveCount(0)
  const rows = table.getByRole('row')
  const n = await rows.count()
  expect(n).toBeGreaterThan(1)
  for (let i = 1; i < Math.min(n, 15); i++) await expect(rows.nth(i)).toContainText('Timetable only')
  await step('vehicles list')
}
