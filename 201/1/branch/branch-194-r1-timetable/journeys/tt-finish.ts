import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
const hhmm = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(ms)
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en?tab=vehicles')
  const map = page.locator('[data-vehicles]')
  await expect(map).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  const snap = await (await page.request.get('/api/snapshot')).json()
  // the trip on the map that arrives at its last stop soonest after this snapshot
  let best: any
  for (const t of snap.trips.filter((t: any) => t.mode === 'bus' && !t.waiting).slice(0, 400)) {
    const d = await (await page.request.get(`/api/trips/${t.key}`)).json()
    const last = d.calls[d.calls.length - 1]
    const at = last.arrival ?? last.departure
    if (at > snap.fetched + 5_000 && (!best || at < best.at)) best = { t, at, name: last.name }
  }
  expect(best).toBeTruthy()
  console.log(`trip ${best.t.line} to ${best.t.headsign} (${best.t.key}) arrives at ${best.name} ${hhmm(best.at)}; snapshot ${hhmm(snap.fetched)}`)
  const table = page.getByRole('table', { name: 'Vehicles' })
  const sel = `a[href*="${best.t.key}"]`
  await expect(table.locator(sel)).toHaveCount(1)
  await step(`before its last arrival ${hhmm(best.at)}: row in the Vehicles list`)
  // wait, without reloading, for the page's snapshot to pass its last arrival
  await expect.poll(async () => (await (await page.request.get('/api/snapshot')).json()).fetched, { timeout: 200_000, intervals: [5000] }).toBeGreaterThan(best.at)
  const after = await (await page.request.get('/api/snapshot')).json()
  console.log(`snapshot now ${hhmm(after.fetched)}, still has trip: ${after.trips.some((t: any) => t.key === best.t.key)}`)
  expect(after.trips.some((t: any) => t.key === best.t.key)).toBe(false)
  await expect(table.locator(sel)).toHaveCount(0, { timeout: 70_000 })
  await expect(page.getByRole('banner').getByText(`Updated ${hhmm(after.fetched)}`)).toBeVisible({ timeout: 70_000 })
  await step(`after its last arrival: row gone, Updated ${hhmm(after.fetched)}`)
}
