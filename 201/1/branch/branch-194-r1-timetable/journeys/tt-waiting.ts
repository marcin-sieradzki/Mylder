import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
const hhmm = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' }).format(ms)
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  await expect(map).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  const snap = await (await page.request.get('/api/snapshot')).json()
  const notCancelled = snap.trips.filter((t: any) => !t.cancelled).length
  console.log(`drawn ${await map.getAttribute('data-vehicles')}, trips not cancelled ${notCancelled}`)
  const waiting = snap.trips.filter((t: any) => t.waiting && t.mode === 'bus')
  expect(waiting.length).toBeGreaterThan(0)
  for (const t of snap.trips.filter((t: any) => t.waiting)) {
    const lead = t.next[0].time - snap.fetched
    expect(lead).toBeLessThanOrEqual(5 * 60_000)
  }
  const t = waiting.sort((a: any, b: any) => b.next[0].time - a.next[0].time)[0]
  const detail = await (await page.request.get(`/api/trips/${t.key}`)).json()
  const first = detail.calls[0]
  console.log(`waiting ${t.line} to ${t.headsign} at ${first.name}, departs ${hhmm(first.departure)}, lead ${(first.departure - snap.fetched) / 1000}s`)
  await step('map before opening the waiting trip')
  // the rider opens the trip from the Vehicles list
  await page.getByRole('dialog', { name: 'Overview' }).getByRole('tab', { name: /^Vehicles/ }).click()
  const table = page.getByRole('table', { name: 'Vehicles' })
  const sel = `a[href*="${t.key}"]`
  const link = table.locator(sel).first()
  await expect(link).toBeVisible()
  const row = table.getByRole('row').filter({ has: page.locator(sel) })
  console.log(`row: ${await row.innerText()}`)
  await step('waiting trip row in the Vehicles list')
  await link.click()
  const panel = page.getByRole('dialog', { name: new RegExp(`to ${t.headsign.replace(/[.()]/g, '\\$&')}`) }).last()
  await expect(panel).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`trip=${t.key.replace(/\./g, '\\.')}`))
  await expect(panel).toContainText('Timetable only')
  await expect(panel).toContainText(`Waiting at ${first.name}, departs ${hhmm(first.departure)}`)
  await expect(panel).toContainText('Delay')
  console.log(`panel: ${(await panel.innerText()).slice(0, 600)}`)
  await step('waiting trip panel: Departs at its first stop')
}
