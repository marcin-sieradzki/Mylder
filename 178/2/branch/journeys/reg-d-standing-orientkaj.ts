import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// stop-standing, desktop: Orientkaj St. from five minutes in.
export default async ({ page, step, expect }: Journey) => {
  await expect.poll(async () => Number((await (await page.request.get('/api/snapshot')).json()).fetched), { timeout: 240000, intervals: [2000] }).toBeGreaterThanOrEqual(Date.UTC(2026, 5, 16, 5, 25, 30))
  await page.goto('/en?stop=54307')
  const panel = page.getByRole('dialog', { name: 'Orientkaj St.' })
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  for (const t of ['991', 'Teglholmen']) await expect(region).toContainText(t)
  await expect(region).toContainText(/Live|Estimated|Timetable only|Last seen|No signal/)
  await expect(region).toContainText(/Now|\d+\s*min/)
  await expect(region).toContainText(/\d\d:\d\d/)
  const rb = (await region.boundingBox())!
  const tb = (await panel.getByRole('tablist', { name: 'Departures and arrivals' }).boundingBox())!
  expect(rb.y + rb.height).toBeLessThanOrEqual(tb.y + 1)
  await step('Orientkaj standing')
  await region.getByRole('button', { name: 'Bus 991 to Teglholmen' }).click()
  await expect(page.getByRole('dialog', { name: /991 to Teglholmen/ })).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=/)
  await expect(page).not.toHaveURL(/[?&]stop=/)
  await step('vehicle open')
}
