import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
const metro = ['27532','8603301','8603302','8603303','8603304','8603305','8603306','8603308','8603309','8603310','8603311','8603312','8603313','8603315','8603317']
export default async ({ page, step, expect }: Journey) => {
  for (const id of metro) {
    await page.goto('/en?stop=' + id)
    const standing = page.getByRole('region', { name: 'At the platforms now' })
    await expect(standing).toBeVisible()
    await expect(standing.getByRole('button', { name: /^Metro / })).toHaveCount(0)
    await expect(standing).not.toContainText(/\bM[1-4]\b/)
    if (id === '27532' || id === '8603308') await step('metro stop ' + id + ' standing has no Metro')
  }
}
