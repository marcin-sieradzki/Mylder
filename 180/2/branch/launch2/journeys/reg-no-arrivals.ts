import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
// Pass rule: open Hillerød St.'s Arrivals -> "No arrivals in the next 30 minutes for the vehicle types shown." and source "Timetable and positions HH:MM:SS".
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=8600683')
  const panel = page.getByRole('dialog', { name: 'Hillerød St.' })
  await expect(panel.getByRole('tablist', { name: 'Departures and arrivals' })).toBeVisible()
  await step('Hillerød St. opened')
  await panel.getByRole('tab', { name: 'Arrivals' }).click()
  const tp = panel.getByRole('tabpanel', { name: 'Arrivals' })
  await expect(tp).toContainText('No arrivals in the next 30 minutes for the vehicle types shown.')
  await expect(tp).toContainText(/Timetable and positions \d\d:\d\d:\d\d/)
  await expect(tp.getByRole('list', { name: 'Arrivals' })).toHaveCount(0)
  console.log('TABPANEL:\n' + (await tp.innerText()))
  await step('empty Arrivals with source line')
}
