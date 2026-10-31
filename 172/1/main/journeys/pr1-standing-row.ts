import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(panel.getByRole('region', { name: 'Departures' })).toBeVisible()
  await step('Refshaleøen opened')
  const standing = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(standing).toBeVisible()
  await expect(standing.getByRole('heading', { name: 'At the platforms now' })).toBeVisible()
  const row = standing.getByRole('list', { name: 'At the platforms now' }).getByRole('listitem').first()
  await expect(row).toContainText('991')
  await expect(row).toContainText('Teglholmen')
  await expect(row).toContainText(/Live|Estimated|Scheduled|No signal/)
  await expect(row).toContainText(/\d+ min|Now/)
  await expect(row.getByRole('time')).toHaveText(/^~?\d\d:\d\d$/)
  const a = await standing.boundingBox(), b = await panel.getByRole('region', { name: 'Departures' }).boundingBox()
  expect(a!.y).toBeLessThan(b!.y)
  await step('standing row above departures')
}
