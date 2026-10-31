import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { findPlanes } from './find-dots.ts'

// Pass rules: a plane points along its track on the flat north-up map; tapping it opens its panel.
export default async ({ page, step, expect }: Journey) => {
  const data = await (await page.request.get('/api/aircraft')).json()
  const want = process.env.HEX
  const plane = data.aircraft.find((a: { hex: string; altitude: unknown }) => (want ? a.hex === want : typeof a.altitude === 'number' && a.altitude > 1000))
  if (!plane) throw new Error('no plane ' + want)
  console.log('plane', plane.hex, plane.callsign, plane.track, plane.lat, plane.lon)
  await page.goto(`/en?map=${process.env.Z ?? '13.00'}/${plane.lat}/${plane.lon}`)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await page.getByRole('dialog', { name: 'Overview' }).getByRole('button', { name: /close/i }).click()
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(2000)
  await step(`paused plane ${plane.callsign} track ${Math.round(plane.track)}`)
  const vp = page.viewportSize()!
  const planes = await findPlanes(page, 0)
  console.log('planes', JSON.stringify(planes))
  planes.sort((a, b) => Math.hypot(a.x - vp.width / 2, a.y - vp.height / 2) - Math.hypot(b.x - vp.width / 2, b.y - vp.height / 2))
  if (!planes.length) throw new Error('no plane glyph drawn on screen')
  const { x, y } = planes[0]
  await page.mouse.click(x, y)
  const name = new RegExp(plane.callsign || plane.hex)
  await expect(page.getByRole('dialog', { name })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`aircraft=${plane.hex}`))
  await step('plane panel')
}
