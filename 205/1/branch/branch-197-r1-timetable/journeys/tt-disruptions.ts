// Pass rule 8: the Disruptions screen's sentence, no list, no data cards.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await step('City pulse')
  const tab = sheet.getByRole('tab', { name: /^Disruptions/ })
  await expect(tab).toHaveAccessibleName('Disruptions')
  await tab.click()
  await expect(page).toHaveURL(/[?&]tab=disruptions/)
  const panel = sheet.getByRole('tabpanel', { name: 'Disruptions' })
  await expect(panel).toBeVisible()
  await step('Disruptions tab')
  await expect(panel).toHaveText("Disruption messages come with Rejseplanen's live connection, which isn't connected yet.")
  await expect(panel.getByRole('list')).toHaveCount(0)
  for (const w of ['From Mylder', 'No answer from Rejseplanen', 'No bus positions since', 'Disruption messages not fetched yet', 'Messages from Rejseplanen', 'Running normally', 'No disruptions'])
    await expect(page.getByText(w)).toHaveCount(0)
  // still so after a snapshot lands
  const updated = page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)
  const before = await updated.innerText()
  await expect(updated).not.toHaveText(before, { timeout: 75000 })
  await expect(panel).toHaveText("Disruption messages come with Rejseplanen's live connection, which isn't connected yet.")
  await expect(tab).toHaveAccessibleName('Disruptions')
  await step('after the next snapshot')
}
