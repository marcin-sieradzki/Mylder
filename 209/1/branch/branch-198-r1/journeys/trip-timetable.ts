import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// vehicle-detail: trip-timetable on the default source, by tapping a bus underway.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const snap = await (await page.request.get('/api/snapshot')).json()
  const bus = snap.trips.find((t: any) => t.mode === 'bus' && !t.waiting)
  const [lat, lon] = bus.position
  await page.goto(`/en?map=14.00/${lat.toFixed(5)}/${lon.toFixed(5)}`)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await page.getByRole('button', { name: 'Pause' }).click()
  await step('centred on a bus')
  const box = (await page.getByRole('region', { name: 'Live map of Copenhagen' }).boundingBox())!
  const sheet = await page.getByRole('dialog', { name: 'Overview' }).boundingBox().catch(() => null)
  const centres = [[box.x + box.width / 2, box.y + box.height / 2]]
  if (sheet) centres.unshift([(sheet.x + sheet.width + box.x + box.width) / 2, box.y + box.height / 2])
  await expect(async () => {
    let hit: number[] | undefined
    outer: for (const [ox, oy] of centres)
      for (let r = 0; r <= 140; r += 7)
        for (const [dx, dy] of r === 0 ? [[0, 0]] : Array.from({ length: 12 }, (_, i) => [r * Math.cos((i * Math.PI) / 6), r * Math.sin((i * Math.PI) / 6)])) {
          await page.mouse.move(ox + dx, oy + dy)
          if (await page.getByRole('tooltip').filter({ hasText: /^Bus/ }).isVisible().catch(() => false)) { hit = [ox + dx, oy + dy]; break outer }
        }
    expect(hit).toBeTruthy()
    await page.mouse.click(hit![0], hit![1])
    await expect(page).toHaveURL(/trip=/, { timeout: 2000 })
  }).toPass({ timeout: 90000 })
  const panel = page.getByRole('dialog', { name: / to / })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Timetable only')
  await expect(panel).toContainText('No live positions yet; placed from the timetable.')
  await expect(panel).toContainText(/Timetable\s·\splaced \d\d:\d\d:\d\d/)
  for (const t of [/Rejseplanen/, /times from the timetable/, /From the timetable/, /position ·|· position/]) await expect(panel.getByText(t)).toHaveCount(0)
  const stops = panel.getByRole('list', { name: 'Stops' }).getByRole('listitem')
  await expect(stops.first()).toBeVisible()
  const txt = await panel.getByRole('list', { name: 'Stops' }).innerText()
  expect(txt).not.toMatch(/~\s?\d\d:\d\d/)
  expect(txt).not.toMatch(/[+−-]\d+\b(?!:)/)
  await step('vehicle detail')
}
