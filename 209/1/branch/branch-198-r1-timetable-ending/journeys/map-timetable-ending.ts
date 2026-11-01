import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// moving-map: map-timetable in the timetable's last week (timetable:timetable-ending).
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect.poll(async () => Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles'))).toBeGreaterThan(0)
  const snap = await (await page.request.get('/api/snapshot')).json()
  expect(JSON.stringify(snap)).toContain('"timetableRunningOut":true')
  expect(snap.serviceDay).toBe('2026-08-25')
  const notice = page.getByText('The timetable ends on 26 August. Without a new one, the map has no trips after that.')
  const banner = page.getByText(/^Timetable only: live positions aren't connected yet/)
  await expect(notice).toBeVisible()
  await expect(banner).toBeVisible()
  expect((await notice.boundingBox())!.y).toBeLessThan((await banner.boundingBox())!.y)
  await expect(page.getByText(/paused|hasn.t answered/i)).toHaveCount(0)
  await step('ending notice above the timetable banner')
  await page.goto('/da')
  await expect(page.getByText('Køreplanen slutter 26. august. Uden en ny har kortet ingen ture derefter.')).toBeVisible()
  await step('Danish ending notice')
}
