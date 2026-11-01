import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// stop-panel: stop-timetable on the default source, by a tap at Hovedbanegården, Tivoli.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?map=17.00/55.67259/12.56661')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await page.getByRole('button', { name: 'Pause' }).click()
  await step('centred on the stop')
  const box = (await page.getByRole('region', { name: 'Live map of Copenhagen' }).boundingBox())!
  const sheet = await page.getByRole('dialog', { name: 'Overview' }).boundingBox().catch(() => null)
  const cx = sheet ? (sheet.x + sheet.width + box.x + box.width) / 2 : box.x + box.width / 2
  const cy = box.y + box.height / 2
  const dialog = page.getByRole('dialog', { name: 'Hovedbanegården, Tivoli' })
  await expect(async () => {
    for (const [dx, dy] of [[0, 0], [box.x + box.width / 2 - cx, 0]]) {
      await page.mouse.click(cx + dx, cy + dy)
      if (await dialog.isVisible().catch(() => false)) break
    }
    await expect(dialog).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 30000 })
  await expect(page).toHaveURL(/stop=10842/)
  const list = dialog.getByRole('list', { name: 'Departures' })
  await expect(list.getByRole('listitem').first()).toBeVisible()
  const items = list.getByRole('listitem')
  const k = await items.count()
  for (let i = 0; i < Math.min(k, 5); i++) {
    await expect(items.nth(i)).toContainText('Timetable only')
    await expect(items.nth(i)).toContainText('—')
  }
  await expect(dialog).toContainText("Countdowns use the timetable alone; live times aren't connected yet.")
  await expect(dialog).toContainText(/Timetable\s·\s\d\d:\d\d:\d\d/)
  for (const t of ['From the timetable', 'Timetable and positions']) await expect(dialog.getByText(t)).toHaveCount(0)
  await step('stop departures')
  await dialog.getByRole('tab', { name: 'Arrivals' }).click()
  await expect(dialog.getByRole('list', { name: 'Arrivals' }).getByRole('listitem').first()).toContainText('Timetable only')
  await step('stop arrivals')
  await page.goto('/en?stop=8603332')
  const metro = page.getByRole('dialog', { name: /Gammel Strand/ })
  await expect(metro).toContainText(/Every \d+ min/)
  await expect(metro).toContainText('Metro: planned times')
  await expect(metro).toContainText(/Timetable\s·\s\d\d:\d\d:\d\d/)
  await step('metro stop')
}
