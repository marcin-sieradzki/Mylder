import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// The RE to Næstved stands at København Syd St., Track 8, from 07:22 to 07:23 on the recording's clock.
export default async ({ page, step, expect }: Journey) => {
  await expect.poll(async () => (await (await page.request.get('/api/snapshot')).json()).fetched, { timeout: 180000, intervals: [3000] }).toBeGreaterThanOrEqual(Date.parse('2026-06-16T05:22:00Z'))
  await page.goto('/en?stop=8600783')
  const syd = page.getByRole('dialog', { name: 'København Syd St.' })
  await expect(syd.getByText(/departures \d\d:\d\d/)).toBeVisible({ timeout: 20000 })
  await expect(syd).toContainText('Rejseplanen')
  const st = syd.getByRole('region', { name: 'At the platforms now' })
  await expect(st).toContainText('RE')
  await expect(st).toContainText('Næstved St.')
  await expect(st).toContainText('Track 8')
  console.log(`standing: ${(await st.innerText()).replace(/\n/g, ' / ')}`)
  await step('RE to Næstved on track 8')
}
