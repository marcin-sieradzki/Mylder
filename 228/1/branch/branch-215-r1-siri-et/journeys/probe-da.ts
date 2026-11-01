import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/da')
  const sheet = page.getByRole('dialog', { name: 'Overblik' })
  await expect(sheet.getByRole('group', { name: 'Gennemsnitlig forsinkelse' })).toBeVisible()
  const a = await sheet.getByRole('tabpanel').ariaSnapshot()
  console.log(a.split('\n').filter((l) => !/listitem: "?\d\d:\d\d/.test(l) && !/- img/.test(l)).join('\n').slice(0, 5000))
  console.log(await page.locator('body').ariaSnapshot().then((x) => x.split('\n').filter((l) => /text: .*(Forsinkelser|data)/.test(l)).join('\n')))
}
