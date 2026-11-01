import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const map = page.locator('[data-vehicles]')
  await expect(map).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await step('map drawn on the timetable')
  const snap = await (await page.request.get('/api/snapshot')).json()
  expect(snap.source).toEqual({ kind: 'timetable' })
  expect(snap.trips.length).toBeGreaterThan(0)
  expect(snap.trips.every((t: any) => t.state === 'timetable-only' && t.hadRealtime === false)).toBe(true)
  const drawn = Number(await map.getAttribute('data-vehicles'))
  console.log(`drawn ${drawn}, snapshot trips ${snap.trips.length}`)
  expect(drawn).toBeGreaterThan(0)
  const tab = page.getByRole('dialog', { name: 'Overview' }).getByRole('tab', { name: /^Vehicles/ })
  await tab.click()
  const table = page.getByRole('table', { name: 'Vehicles' })
  await expect(table).toBeVisible()
  await step('vehicles list')
  const rows = table.getByRole('row')
  const n = await rows.count()
  const texts = await rows.allInnerTexts()
  const body = texts.slice(1)
  console.log(`rows ${body.length}; first: ${body.slice(0, 3).join(' | ')}`)
  const notTT = body.filter((r) => !/Timetable only/.test(r))
  console.log(`rows without Timetable only: ${notTT.length} ${notTT.slice(0, 3).join(' | ')}`)
  expect(n).toBeGreaterThan(1)
  expect(notTT.length).toBe(0)
  // Hover a dot: centre on a bus underway and search near the middle
  const t = snap.trips.find((x: any) => x.mode === 'bus' && !x.waiting && x.position)
  await page.goto(`/en?map=15.00/${t.position[0].toFixed(5)}/${t.position[1].toFixed(5)}`)
  await expect(map).not.toHaveAttribute('data-vehicles', '0', { timeout: 30000 })
  await page.getByRole('button', { name: 'Pause' }).click()
  await step('centred on a bus, paused')
  const vp = page.viewportSize()!
  let found = false
  for (let r = 0; r <= 130 && !found; r += 5) for (let a = 0; a < 360; a += r === 0 ? 360 : 15) {
    await page.mouse.move(vp.width / 2 + r * Math.cos((a * Math.PI) / 180), vp.height / 2 + r * Math.sin((a * Math.PI) / 180))
    if (await page.getByRole('tooltip').isVisible().catch(() => false)) { found = true; break }
    await page.waitForTimeout(20)
  }
  expect(found).toBe(true)
  await expect(page.getByRole('tooltip')).toContainText('Timetable only')
  await step('hover card says Timetable only')
}
