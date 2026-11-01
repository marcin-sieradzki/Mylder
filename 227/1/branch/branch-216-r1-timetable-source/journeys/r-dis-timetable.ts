import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?tab=disruptions')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  const panel = sheet.getByRole('tabpanel')
  await expect(panel).toHaveText("Disruption messages come with Rejseplanen's live connection, which isn't connected yet.")
  await expect(panel.getByRole('list')).toHaveCount(0)
  for (const w of ['From Mylder', 'No answer from Rejseplanen', 'No bus positions since', 'Disruption messages not fetched yet', 'Messages from Rejseplanen', 'Delays from Rejseplanen']) await expect(panel).not.toContainText(w)
  await expect(sheet.getByRole('tab', { name: /^Disruptions/ })).toHaveText(/^Disruptions$/)
  await step('timetable source disruptions')
  await page.goto('/da?tab=disruptions')
  await expect(page.getByRole('dialog', { name: 'Overblik' }).getByRole('tabpanel')).toHaveText('Driftsmeddelelser kommer med Rejseplanens liveforbindelse, som ikke er koblet på endnu.')
  await step('danish')
}
