import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { scanTips } from './lib.ts'
// Pass rule 3: a cancelled trip is not drawn: centred on bus 102A of 09:22 while it is cancelled,
// no dot and no tooltip for it, and [data-vehicles] leaves it out.
const KEY = 'bus.102A.5c72f1b7d1.20261031.0922'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await step('map open')
  const snap = await (await page.request.get('/api/snapshot')).json()
  const t = snap.trips.find((t: any) => t.key === KEY)
  console.log(JSON.stringify({ fetched: new Date(snap.fetched).toISOString(), trip: t }))
  expect(t, `${KEY} in /api/snapshot`).toBeTruthy()
  await page.goto(`/en?map=16.00/${t.position[0].toFixed(5)}/${t.position[1].toFixed(5)}`)
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(2500)
  await step('centred on 102A of 09:22 paused')
  const tips = await scanTips(page, 40)
  console.log(JSON.stringify({ tips }))
  await step('hovered around the middle')
  const s2 = await (await page.request.get('/api/snapshot')).json()
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', String(s2.trips.filter((t: any) => !t.cancelled).length))
  expect(t.cancelled, 'the trip is cancelled in /api/snapshot').toBe(true)
  expect(tips.filter((x) => /102A/.test(x)), 'no 102A tooltip at the cancelled trip').toEqual([])
}
