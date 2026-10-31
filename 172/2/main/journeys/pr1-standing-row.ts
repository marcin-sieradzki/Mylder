import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule: open a stop with a vehicle standing (Refshaleøen, run's first three minutes) -> "At the platforms now"
// above Departures, a row with line, destination, data state in words, countdown and time; region announced by name.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map loaded')
  await page.goto('/en?stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(panel.getByRole('region', { name: 'Departures' })).toBeVisible()
  await expect(page).toHaveURL(/[?&]stop=48645/)
  await step('Refshaleøen opened')
  const standing = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(standing).toBeVisible()
  await expect(standing.getByRole('heading', { name: 'At the platforms now' })).toBeVisible()
  const row = standing.getByRole('listitem').first()
  await expect(row).toContainText('991')
  await expect(row).toContainText('Teglholmen')
  await expect(row).toContainText(/Live|Ageing|Estimated|Timetable only|Scheduled|No signal/)
  await expect(row).toContainText(/\d+ min|Now/)
  await expect(row.getByRole('time')).toHaveText(/^~?\d\d:\d\d$/)
  const a = await standing.boundingBox(), b = await panel.getByRole('region', { name: 'Departures' }).boundingBox()
  expect(a!.y).toBeLessThan(b!.y)
  console.log('ROW:', await row.innerText())
  const api = await (await page.request.get('/api/stops/48645')).json()
  console.log('API standing:', JSON.stringify(api.standing))
  await step('standing row above departures')
}
