// main's before for About: what the dialog says about delays and their credit with SIRI-ET's delays on.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await expect(sheet.getByRole('group', { name: 'On the move' })).toContainText(/\d/)
  console.log('pulse', JSON.stringify((await sheet.getByRole('tabpanel').innerText()).replace(/\n\d\d:\d\d \d+/g, '').slice(0, 1600)))
  await step('city pulse on main')
  await page.getByRole('button', { name: 'About Mylder' }).click()
  const d = page.getByRole('dialog', { name: 'About Mylder' })
  const t = await d.innerText()
  console.log('about', JSON.stringify(t))
  await d.getByRole('term').filter({ hasText: /^Source$/ }).scrollIntoViewIfNeeded()
  await step('about on main')
  expect(t).toMatch(/Rejsekort/)
}
