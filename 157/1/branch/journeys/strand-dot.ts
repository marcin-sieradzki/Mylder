import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { findDots } from './find-dots.ts'

// Pass rules: a vehicle on a shared S-tog track sits on its line's strand; hovering it shows its card; tapping it opens its panel.
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  const trip = snap.trips.find((t: { line: string; mode: string }) => t.mode === 's-tog' && t.line === process.env.LINE && t.state === 'live')
  if (!trip) throw new Error(`no Live S-tog line ${process.env.LINE} trip in this minute`)
  const [lat, lon] = trip.position
  console.log('trip', trip.key, lat, lon)
  await page.goto(`/en?map=${process.env.Z ?? '15.00'}/${lat}/${lon}`)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(1500)
  await step('paused on the dot')
  const box = (await page.getByRole('region', { name: 'Live map of Copenhagen' }).boundingBox())!
  const dots = await findDots(page)
  console.log('dots', JSON.stringify(dots))
  const vp = page.viewportSize()!
  dots.sort((a, b) => Math.hypot(a.x - vp.width / 2, a.y - vp.height / 2) - Math.hypot(b.x - vp.width / 2, b.y - vp.height / 2))
  if (!dots.length) throw new Error('no filled dot found on screen near the trip')
  const { x, y } = dots[0]
  console.log('hover at', x, y)
  console.log('region', JSON.stringify(box))
  await expect(async () => {
    await page.mouse.move(x - 60, y - 60)
    await page.mouse.move(x, y)
    await expect(page.getByRole('tooltip')).toContainText(trip.line, { timeout: 1000 })
    await expect(page.getByRole('tooltip')).toContainText(trip.headsign.replace(/ St\.$/, ''), { timeout: 1000 })
  }).toPass({ timeout: 15000 })
  await step('hovered card')
  await page.mouse.click(x, y)
  await expect(page.getByRole('dialog', { name: new RegExp(`to ${trip.headsign.replace('.', '\\.')}`) })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`trip=${encodeURIComponent(trip.key).replace(/\./g, '\\.')}`))
  await step('tapped panel')
}
