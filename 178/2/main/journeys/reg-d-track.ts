import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// stop-standing track, desktop: København Syd 07:22-07:23.
export default async ({ page, step, expect }: Journey) => {
  const t22 = Date.UTC(2026, 5, 16, 5, 22)
  await expect.poll(async () => Number((await (await page.request.get('/api/snapshot')).json()).fetched), { timeout: 150000, intervals: [1000] }).toBeGreaterThanOrEqual(t22)
  const fetched = Number((await (await page.request.get('/api/snapshot')).json()).fetched)
  console.log('snapshot fetched ' + new Date(fetched).toISOString())
  expect(fetched, 'the RE stands at København Syd only until 07:23 on the recording').toBeLessThan(t22 + 60000)
  await page.goto('/en?stop=8600783')
  const panel = page.getByRole('dialog', { name: 'København Syd St.' })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Rejseplanen')
  await expect(panel).toContainText(/departures \d\d:\d\d/)
  const row = panel.getByRole('region', { name: 'At the platforms now' }).getByRole('listitem').filter({ hasText: 'Næstved St.' })
  for (const t of ['RE', 'Næstved St.', 'Track 8']) await expect(row).toContainText(t)
  await step('RE to Næstved, Track 8')
}
