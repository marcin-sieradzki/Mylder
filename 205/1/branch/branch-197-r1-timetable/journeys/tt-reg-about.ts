// Regression (dis-timetable recipe): About's Disruptions fact on the timetable source, EN and DA.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  for (const [lang, fact, value, sentence] of [
    ['en', 'Disruptions', 'Not connected yet', "Disruption messages come with Rejseplanen's live connection, which isn't connected yet."],
    ['da', 'Driftsforstyrrelser', 'Ikke koblet på endnu', 'Driftsmeddelelser kommer med Rejseplanens liveforbindelse, som ikke er koblet på endnu.'],
  ] as const) {
    await page.goto(`/${lang}?tab=disruptions`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
    await expect(page.getByRole('tabpanel')).toHaveText(sentence)
    await step(`${lang} disruptions tab`)
    await page.getByRole('link', { name: 'Rejseplanen', exact: true }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: fact }).last()
    await expect(dialog).toBeVisible()
    await step(`${lang} About`)
    const text = (await dialog.innerText()).replace(/\s+/g, ' ')
    console.log(`${lang} about: ${text.slice(0, 600)}`)
    expect(text).toMatch(new RegExp(`${fact}\\s*${value}`))
    await page.keyboard.press('Escape')
  }
}
