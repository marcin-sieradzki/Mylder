import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const scale = page.getByText(/\d+\s(m|km)$/)
  await expect(scale).toBeVisible({ timeout: 20000 })
  const toM = (s: string) => { const [, n, u] = s.match(/(\d+)\s(m|km)$/)!; return Number(n) * (u === 'km' ? 1000 : 1) }
  const before = toM(await scale.innerText())
  await step(`scale ${before}`)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(async () => expect(toM(await scale.innerText())).toBeLessThan(before)).toPass()
  await step('zoomed in')
}
