import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './_dump.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  const snap = await (await page.request.get('/api/snapshot')).json()
  const tt = snap.status.timetable
  dump('timetable', tt)
  await step(`timetable ${tt.daysLeft} days left`)
  const statuses = await page.getByRole('status').allInnerTexts()
  dump('statuses', statuses)
  if (!(tt.daysLeft < 7)) throw new Error(`Precondition not reachable: the deployed timetable has ${tt.daysLeft} days left (last day ${tt.last}), and the timetable source runs at the real time; the notice needs under 7. No notice shows now, as expected at ${tt.daysLeft} days: ${JSON.stringify(statuses)}`)
  await expect(page.getByRole('status').filter({ hasText: /^The timetable ends / })).toBeVisible()
  await step('timetable notice')
}
