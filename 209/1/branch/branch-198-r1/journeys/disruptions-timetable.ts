import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// disruptions: dis-timetable on the default source.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await expect(sheet).toBeVisible()
  await step('overview open')
  await sheet.getByRole('tab', { name: /^Disruptions/ }).click()
  await expect(page).toHaveURL(/tab=disruptions/)
  const panel = sheet.getByRole('tabpanel')
  await expect(panel).toHaveText("Disruption messages come with Rejseplanen's live connection, which isn't connected yet.")
  await expect(panel.getByRole('list')).toHaveCount(0)
  await expect(sheet.getByRole('tab', { name: /^Disruptions/ })).toHaveText(/^Disruptions$/)
  for (const t of ['From Mylder', 'No answer from Rejseplanen', 'No bus positions since', 'Disruption messages not fetched yet', 'Messages from Rejseplanen'])
    await expect(page.getByText(t)).toHaveCount(0)
  await step('disruptions tab')
  await page.getByRole('link', { name: 'Rejseplanen' }).click()
  const about = page.getByRole('dialog', { name: 'About Mylder' })
  await expect(about).toBeVisible()
  await expect(about).toContainText('Not connected yet')
  await step('about from the credit')
  await page.goto('/da?tab=disruptions')
  await expect(page.getByText('Driftsmeddelelser kommer med Rejseplanens liveforbindelse, som ikke er koblet på endnu.')).toBeVisible()
  await step('Danish disruptions')
}
