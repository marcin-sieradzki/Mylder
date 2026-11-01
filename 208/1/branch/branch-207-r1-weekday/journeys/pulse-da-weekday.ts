import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Check of the shared Metro line on a recording: Danish City pulse's Metro meter line, logged and
// compared between main and the branch.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/da')
  await expect(page.getByText(/16\. juni 2026/).first()).toBeVisible()
  const sheet = page.getByRole('dialog', { name: 'Overblik' })
  await expect(sheet).toBeVisible()
  await step('Danish City pulse on the recording')
  const metro = sheet.getByText(/^Ingen realtid fra Metroen/)
  await metro.scrollIntoViewIfNeeded()
  await step('Metro meter line in view')
  console.log(`Metro line: ${(await metro.innerText()).trim()}`)
  const text = await sheet.innerText()
  console.log(`placeret lines:\n${text.split('\n').filter((l) => /placeret/.test(l)).join('\n')}`)
  expect(text).not.toMatch(/placeret ud fra/)
}
