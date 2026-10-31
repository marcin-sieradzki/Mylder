import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// stop-standing, desktop: Refshaleøen by link (first 3 min); the section is rows, not a sideways row.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(panel).toBeVisible()
  const region = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(region).toContainText('991')
  await step('Refshaleøen desktop panel')
  console.log('REGION ARIA:\n' + (await region.ariaSnapshot()))
  for (const t of ['991', 'Teglholmen']) await expect(region).toContainText(t)
  await expect(region).toContainText(/Live|Estimated|Timetable only|Last seen|No signal/)
  await expect(region).toContainText(/Now|\d+\s*min/)
  await expect(region).toContainText(/\d\d:\d\d/)
  await expect(region.getByRole('button', { name: /^Show all/ })).toHaveCount(0)
  const scrollers = await region.evaluate((el) => [el, ...el.querySelectorAll('*')].filter((n) => ['auto', 'scroll'].includes(getComputedStyle(n).overflowX)).length)
  console.log('horizontal scrollers in region: ' + scrollers)
  expect(scrollers).toBe(0)
  const rb = (await region.boundingBox())!
  const tb = (await panel.getByRole('tablist', { name: 'Departures and arrivals' }).boundingBox())!
  expect(rb.y + rb.height).toBeLessThanOrEqual(tb.y + 1)
  await region.getByRole('button', { name: 'Bus 991 to Teglholmen' }).click()
  await expect(page.getByRole('dialog', { name: /991 to Teglholmen/ })).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=/)
  await expect(page).not.toHaveURL(/[?&]stop=/)
  await step('vehicle open')
}
