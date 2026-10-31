import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=48645')
  const panel = page.getByRole('dialog', { name: 'Refshaleøen' })
  await expect(panel.getByRole('region', { name: 'Departures' })).toBeVisible()
  await step('Refshaleøen opened')
  const row = panel.getByRole('region', { name: 'At the platforms now' }).getByRole('listitem').first()
  await expect(row).toContainText('991')
  // the rider must see where to walk: a platform or a track on the standing row
  await expect(row).toContainText(/Platform|Track|Stop position|Stander|Pos\./i, { timeout: 3000 })
  await step('platform or track shown')
}
