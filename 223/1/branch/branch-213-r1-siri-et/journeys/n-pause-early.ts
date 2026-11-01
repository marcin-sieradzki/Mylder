import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Observation: Pause pressed before the first snapshot has drawn.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?map=15.00/55.67600/12.56800')
  await page.getByRole('button', { name: 'Pause' }).click()
  await step('paused before the first snapshot')
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await page.waitForTimeout(5000)
  const n = await page.locator('[data-vehicles]').getAttribute('data-vehicles')
  console.log(JSON.stringify({ dataVehicles: n }))
  await step('snapshot landed while paused')
  await page.getByRole('button', { name: 'Play' }).or(page.getByRole('button', { name: /Resume|Play/ })).first().click()
  await page.waitForTimeout(3000)
  await step('resumed')
}
