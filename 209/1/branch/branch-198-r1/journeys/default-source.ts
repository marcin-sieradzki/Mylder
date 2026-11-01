import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule: a rider opens /en on a production server started with MYLDER_SOURCE unset, and sees
// the timetable banner, the legend's Timetable only line, and Timetable only dots.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
  await expect
    .poll(async () => Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles')))
    .toBeGreaterThan(0)
  await step('map loaded on the default source')

  const snapshot = await (await page.request.get('/api/snapshot')).json()
  expect(snapshot.source).toEqual({ kind: 'timetable' })
  const states = new Set(snapshot.trips.map((t: { state: string }) => t.state))
  expect([...states]).toEqual(['timetable-only'])

  const banner = page.getByRole('status').filter({ hasText: /^Timetable only: live positions/ })
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(
    "Timetable only: live positions aren't connected yet, so every vehicle is placed where its timetable says it should be.",
  )
  await expect(page.getByText(/Simulated|simulat/i)).toHaveCount(0)
  await expect(page.getByText(/paused|hasn.t answered/i)).toHaveCount(0)
  const legend = page.getByRole('list', { name: 'Data states' })
  await expect(legend).toBeVisible()
  await expect(
    page.getByText("Every vehicle is Timetable only for now: live positions aren't connected yet."),
  ).toBeVisible()
  await step('banner and legend')

  // A dot reads Timetable only on hover.
  const bus =
    snapshot.trips.find((t: { mode: string; waiting?: unknown }) => t.mode === 'bus' && !t.waiting) ??
    snapshot.trips[0]
  const [lat, lon] = bus.position
  await page.goto(`/en?map=15.00/${lat.toFixed(5)}/${lon.toFixed(5)}`)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await page.getByRole('button', { name: 'Pause' }).click()
  const box = (await page.getByRole('region', { name: 'Live map of Copenhagen' }).boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await step('centred on a bus, paused')
  // The map's centre sits right of the open sheet on a desktop; spiral out from both centres.
  const sheet = await page.getByRole('dialog', { name: 'Overview' }).boundingBox().catch(() => null)
  const centres = [[cx, cy]]
  if (sheet) centres.unshift([(sheet.x + sheet.width + box.x + box.width) / 2, cy])
  await expect(async () => {
    let found = false
    outer: for (const [ox, oy] of centres) {
      for (let r = 0; r <= 90; r += 6) {
        const pts = r === 0 ? [[0, 0]] : Array.from({ length: 12 }, (_, i) => [r * Math.cos((i * Math.PI) / 6), r * Math.sin((i * Math.PI) / 6)])
        for (const [dx, dy] of pts) {
          await page.mouse.move(ox + dx, oy + dy)
          if (await page.getByRole('tooltip').isVisible().catch(() => false)) { found = true; break outer }
        }
      }
    }
    expect(found).toBe(true)
    await expect(page.getByRole('tooltip')).toContainText('Timetable only', { timeout: 500 })
  }).toPass({ timeout: 40000 })
  await step('a dot reads Timetable only')
}
