// Pass rule 7: the Vehicles list lists every vehicle on the map with line, destination, Timetable only.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  await expect(map).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  const sheet = page.getByRole('dialog', { name: 'Overview' })
  await step('City pulse')
  await sheet.getByRole('tab', { name: /^Vehicles/ }).click()
  await expect(page).toHaveURL(/[?&]tab=vehicles/)
  const table = sheet.getByRole('table', { name: 'Vehicles' })
  await expect(table).toBeVisible()
  await step('Vehicles list')
  const body = table.getByRole('rowgroup').nth(1).getByRole('row')
  await expect.poll(async () => {
    const s = await (await page.request.get('/api/snapshot')).json()
    const drawn = Number(await map.getAttribute('data-vehicles'))
    const rows = await body.count()
    return `${rows}/${drawn}/${s.trips.length}`
  }, { timeout: 30000 }).toMatch(/^(\d+)\/\1\/\1$/)
  const headers = await table.getByRole('columnheader').allInnerTexts()
  console.log(`headers: ${headers.join(' | ')}`)
  expect(headers.map((h) => h.trim())).not.toContain('Delay')
  const rows = await body.evaluateAll((els) => els.map((r) => Array.from(r.children).map((c) => (c as HTMLElement).innerText.trim())))
  const bad = rows.filter((cells) => !cells[0] || !cells[1] || cells[cells.length - 1] !== 'Timetable only')
  console.log(`rows ${rows.length}, bad ${bad.length}: ${JSON.stringify(bad.slice(0, 3))}; first ${JSON.stringify(rows.slice(0, 2))}`)
  expect(rows.length).toBeGreaterThan(0)
  expect(bad).toEqual([])
  const placed = sheet.locator('time', { hasText: /^placed \d\d:\d\d:\d\d$/ })
  expect(await placed.first().locator('xpath=..').innerText()).toMatch(/^Timetable\s·\splaced \d\d:\d\d:\d\d$/)
  // a bus row
  await sheet.getByLabel('Search lines and destinations').fill('5C')
  await expect(body.first()).toBeVisible()
  await step('search 5C')
  const five = await body.evaluateAll((els) => els.map((r) => (r as HTMLElement).innerText))
  expect(five.length).toBeGreaterThan(0)
  for (const r of five) expect(r).toMatch(/5C[\s\S]*Timetable only/)
}
