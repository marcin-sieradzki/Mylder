import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
const outside = (page: any) => page.locator('[role=status]:not([role=dialog] [role=status])')
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
  const snap = await (await page.request.get('/api/snapshot')).json()
  expect(snap.timetableRunningOut).toBe(true)
  expect(snap.serviceDay).toBe('2026-08-25')
  await expect(outside(page).nth(0)).toHaveText('The timetable ends on 26 August. Without a new one, the map has no trips after that.')
  await expect(outside(page).nth(1)).toHaveText(/^Timetable only: live positions aren't connected yet/)
  await step('timetable ending en')
  await page.goto('/da')
  await expect(outside(page).nth(0)).toHaveText('Køreplanen slutter 26. august. Uden en ny har kortet ingen ture derefter.')
  await step('timetable ending da')
}
