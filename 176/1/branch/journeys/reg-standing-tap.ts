import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  const standing = panel.getByRole('region', { name: 'At the platforms now' })
  await expect(standing.getByRole('button', { name: 'Bus 991 to Teglholmen' })).toBeVisible()
  await step('standing row before tap')
  await standing.getByRole('button', { name: 'Bus 991 to Teglholmen' }).click()
  const vehicle = page.getByRole('dialog', { name: /991 to Teglholmen/ })
  await expect(vehicle).toBeVisible()
  await expect(vehicle.getByRole('list', { name: 'Stops' })).toBeVisible()
  await expect(page).toHaveURL(/[?&]trip=bus\.991\./)
  expect(page.url()).not.toMatch(/[?&]stop=/)
  await step('vehicle panel opened from standing row')
}
