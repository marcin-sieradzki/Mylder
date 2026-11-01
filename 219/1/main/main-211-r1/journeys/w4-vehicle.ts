import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { dump } from './dump.ts'
const J = 'w4-vehicle'
// Opens each mode's first vehicle from the Vehicles list (searching its line), as a rider would.
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  const picks: Record<string, any> = {}
  for (const t of snap.trips) if (!picks[t.mode] && !t.cancelled) picks[t.mode] = t
  for (const [mode, trip] of Object.entries(picks)) {
    await page.goto('/en?tab=vehicles')
    const sheet = page.getByRole('dialog', { name: 'Overview' })
    const table = sheet.getByRole('table', { name: 'Vehicles' })
    await expect(table).toBeVisible()
    const line = trip.line?.name ?? trip.line ?? trip.lineName
    await sheet.getByLabel('Search lines and destinations').fill(String(line))
    await step(`${mode} list searched`)
    const row = table.getByRole('row').filter({ hasText: String(trip.headsign ?? '') }).first()
    await row.getByRole('link').first().click()
    const panel = page.getByRole('dialog', { name: / to / })
    await expect(panel).toBeVisible()
    await expect(page).toHaveURL(/trip=/)
    await expect(panel.getByRole('list', { name: 'Stops' })).toBeVisible()
    for (const w of ['Delay', 'Last seen', 'Next stop']) await expect(panel.getByText(w, { exact: true }).first()).toBeVisible()
    await page.waitForTimeout(800)
    await step(`${mode} vehicle open`)
    const url = new URL(page.url())
    dump(J, `${mode}.${url.searchParams.get('trip')}`, await panel.innerText())
    await page.keyboard.press('Escape')
    await expect(page).not.toHaveURL(/trip=/)
  }
  // Danish: the first bus again
  const bus = picks.bus
  await page.goto(`/da?trip=${encodeURIComponent(bus.key ?? bus.id)}`)
  const panel = page.getByRole('dialog', { name: / (mod|til) / })
  await expect(panel).toBeVisible()
  await page.waitForTimeout(800)
  await step('da bus vehicle')
  dump(J, `da.bus`, await panel.innerText())
}
