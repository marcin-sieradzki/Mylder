import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?stop=8600683&board=arrivals')
  const tp = page.getByRole('tabpanel', { name: 'Arrivals' })
  await expect(tp).toContainText('No arrivals in the next 30 minutes for the vehicle types shown.')
  await expect(tp).toContainText(/Timetable and positions \d\d:\d\d/)
  await step('Hillerød no arrivals')
}
