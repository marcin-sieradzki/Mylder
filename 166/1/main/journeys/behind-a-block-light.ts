import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule: in light theme at zoom 16 and 60°, a rider looks at a vehicle among the inner city's
// blocks and still reads it as on its street, the street grid showing through the blocks, and the
// line paths and stops drawn over them. The dot is found by taking its mode off with the mode chip
// and seeing what went, then hovered for its card.
export default async ({ page, step, expect }: Journey) => {
  await page.emulateMedia({ colorScheme: 'light' })
  const map = page.locator('[data-vehicles]')
  const snapshot = await (await page.request.get('/api/snapshot')).json()
  type Trip = { line: string; mode: string; position?: [number, number]; key: string }
  const inner = (snapshot.trips as Trip[]).filter(
    (t) => t.position && t.mode !== 's-tog' && t.position[0] > 55.665 && t.position[0] < 55.7 && t.position[1] > 12.55 && t.position[1] < 12.6,
  )
  expect(inner.length, 'a bus or Metro in the inner city in this minute').toBeGreaterThan(0)
  const trip = inner[0]
  const [lat, lon] = trip.position!
  await page.goto(`/en?map=16.00/${lat.toFixed(5)}/${lon.toFixed(5)}/-30.0/60.0`)
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Close' }).first().click().catch(() => {})
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(map).toHaveAttribute('data-tilt', '60', { timeout: 30000 })
  await page.waitForTimeout(15000)
  await step(`${trip.mode} ${trip.line} among the blocks`)
  const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: new RegExp(`^${trip.mode === 'bus' ? 'Bus' : trip.mode === 'metro' ? 'Metro' : 'Train'}`) })
  const shown = await page.screenshot()
  await chip.click()
  await page.waitForTimeout(3000)
  const hidden = await page.screenshot()
  await step(`${trip.mode} chip off`)
  await chip.click()
  await page.waitForTimeout(3000)
  const spots: [number, number][] = await page.evaluate(async ([a, b]) => {
    const load = async (s: string) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob())
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const g = c.getContext('2d')!
      g.drawImage(bmp, 0, 0)
      return g.getImageData(0, 0, bmp.width, bmp.height)
    }
    const x = await load(a)
    const y = await load(b)
    const pts: [number, number][] = []
    for (let i = 0; i < x.data.length; i += 4) {
      const d = Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2])
      if (d > 120) pts.push([(i / 4) % x.width, Math.floor(i / 4 / x.width)])
    }
    // cluster by 30 px cells, skipping the top bar
    const cells = new Map<string, [number, number, number]>()
    for (const [px, py] of pts) {
      if (py < 60) continue
      const k = `${Math.floor(px / 30)},${Math.floor(py / 30)}`
      const c = cells.get(k) ?? [0, 0, 0]
      cells.set(k, [c[0] + px, c[1] + py, c[2] + 1])
    }
    return [...cells.values()].filter((c) => c[2] > 15).map((c) => [Math.round(c[0] / c[2]), Math.round(c[1] / c[2])] as [number, number])
  }, [shown.toString('base64'), hidden.toString('base64')])
  console.log(`dots of ${trip.mode} drawn at ${JSON.stringify(spots)}`)
  expect(spots.length, `a ${trip.mode} dot drawn in view`).toBeGreaterThan(0)
  let card = ''
  for (const [sx, sy] of spots) {
    for (const [dx, dy] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
      await page.mouse.move(sx + dx, sy + dy)
      await page.waitForTimeout(150)
      const tip = page.getByRole('tooltip')
      if (await tip.isVisible().catch(() => false)) { card = await tip.innerText(); break }
    }
    if (card) break
  }
  console.log(`card on hover: ${card || 'none'}`)
  await step('chip back on')
}
