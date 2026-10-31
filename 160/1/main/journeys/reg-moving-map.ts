import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, map, scale, snapshot, viewportMiddle, around } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  // Draw
  await expect(map(page)).toHaveAttribute('data-vehicles', '17')
  await expect(page.getByRole('region', { name: 'Live map of Copenhagen' })).toBeVisible()
  await step('draw: 17 dots')
  // Chrome
  await expect(page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Data states' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Map controls' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rejseplanen' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Recorded data from 16 June 2026/ })).toBeVisible()
  // Filter
  const bus = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: /^Bus/ })
  const busCount = Number((await bus.innerText()).match(/\d+/)![0])
  await bus.click()
  await expect(map(page)).toHaveAttribute('data-vehicles', String(17 - busCount))
  await expect(bus).toHaveText(new RegExp(`${busCount}`))
  await step('filter: bus off')
  await bus.click()
  await expect(map(page)).toHaveAttribute('data-vehicles', '17')
  await step('filter: bus back')
  // Controls
  const before = await scale(page).innerText()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.waitForTimeout(1500)
  const after = await scale(page).innerText()
  console.log('scale', before, '->', after)
  const metres = (s: string) => { const m = s.match(/(\d+)\s(m|km)$/)!; return Number(m[1]) * (m[2] === 'km' ? 1000 : 1) }
  expect(metres(after)).toBeLessThan(metres(before))
  await step('controls: zoomed in, shorter scale')
  // Card
  await page.getByRole('button', { name: 'Pause' }).click()
  const snap = await snapshot(page)
  const t = snap.trips.find((x: any) => x.mode === 's-tog') ?? snap.trips[0]
  await page.goto(`/en?map=15.00/${t.position[0].toFixed(5)}/${t.position[1].toFixed(5)}`)
  await ready(page, expect)
  await page.getByRole('button', { name: 'Pause' }).click()
  const { x, y } = viewportMiddle(page)
  const tip = page.getByRole('tooltip')
  let hit
  for (const p of around(x, y, 80, 5)) {
    await page.mouse.move(p.x, p.y)
    await page.waitForTimeout(40)
    if (await tip.isVisible()) { hit = p; break }
  }
  if (!hit) throw new Error(`no card within 80 px of ${t.line}'s snapshot position`)
  console.log('card', await tip.innerText(), 'at', JSON.stringify(hit))
  await expect(tip).toContainText(/Live|Ageing|Estimated|Timetable|No signal|schedule/i)
  await step('card on hover')
}
