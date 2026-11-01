import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// map-delays, "The Metro Timetable only": hover a Metro dot; its card says Timetable only.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  const snap = await (await page.request.get('/api/snapshot')).json()
  const metros = snap.trips.filter((t: any) => t.mode === 'metro')
  expect(metros.length).toBeGreaterThan(0)
  for (const m of metros) expect(m.state, m.key).toBe('timetable-only')
  const m = metros[0]
  console.log('metro', m.key, m.line, m.headsign, m.position)
  await page.goto(`/en?map=15.00/${m.position[0].toFixed(5)}/${m.position[1].toFixed(5)}`)
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(800)
  await step('paused on metro')
  const box = (await page.getByRole('region', { name: 'Live map of Copenhagen' }).boundingBox())!
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  // It has moved on from its snapshot position: hover outwards from the middle, nearest first.
  const pts: [number, number][] = []
  for (let r = 0; r <= 120; r += 3)
    for (let a = 0; a < 360; a += r === 0 ? 360 : Math.max(5, 360 / ((2 * Math.PI * r) / 3)))
      pts.push([cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)])
  let text: string | null = null
  for (const [x, y] of pts) {
    await page.mouse.move(x, y)
    try {
      await expect(page.getByRole('tooltip')).toContainText(`Metro ${m.line}`, { timeout: 80 })
      text = await page.getByRole('tooltip').textContent()
      break
    } catch {}
  }
  expect(text, 'a Metro dot near its snapshot position').toBeTruthy()
  console.log('tooltip', text)
  await step('metro tooltip')
  await expect(page.getByRole('tooltip')).toContainText('Timetable only')
  await expect(page.getByRole('tooltip')).not.toContainText('Estimated')
}
