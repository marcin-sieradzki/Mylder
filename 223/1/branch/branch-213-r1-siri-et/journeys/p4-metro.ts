import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { hoverFind } from './lib.ts'
// Pass rule 4: with delays flowing (updates fresh, buses Estimated), a Metro dot still says
// Timetable only, and every Metro trip is timetable-only.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await page.getByRole('button', { name: 'Pause' }).click()
  await step('map paused')
  const snap = await (await page.request.get('/api/snapshot')).json()
  const metro = snap.trips.filter((t: any) => t.mode === 'metro')
  const lr = snap.trips.filter((t: any) => t.mode === 'light-rail')
  console.log(JSON.stringify({ updates: snap.updates, metro: metro.length, lightRail: lr.length, estimated: snap.trips.filter((t: any) => t.state === 'estimated').length }))
  const m = metro.find((t: any) => !t.waiting) ?? metro[0]
  await page.goto(`/en?map=16.00/${m.position[0].toFixed(5)}/${m.position[1].toFixed(5)}`)
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
  await page.getByRole('button', { name: 'Pause' }).click()
  await step(`centred on metro ${m.line}`)
  const text = await hoverFind(page, expect, new RegExp(`${m.line}[\\s\\S]*(Timetable only|Estimated)`))
  await step(`hover metro ${m.line}`)
  expect(text).toMatch(/Timetable only/)
  expect(metro.every((t: any) => t.state === 'timetable-only')).toBe(true)
  expect(lr.every((t: any) => t.state === 'timetable-only')).toBe(true)
  expect(snap.updates?.fresh, 'delays flowing: updates fresh').toBe(true)
  expect(snap.trips.some((t: any) => t.state === 'estimated'), 'other trips Estimated in the same snapshot').toBe(true)
}
