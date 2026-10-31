import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// Pass rule: in light theme at zoom 16 and 60°, a rider looks up the street at a vehicle with
// blocks standing between them and it, and still reads it as on its street. The camera stands
// 250 m short of the vehicle so blocks stand in front of it; the dot is found by taking its mode
// off with its chip and seeing what went.
export default async ({ page, step, expect }: Journey) => {
  await page.emulateMedia({ colorScheme: 'light' })
  const map = page.locator('[data-vehicles]')
  const snapshot = await (await page.request.get('/api/snapshot')).json()
  type Trip = { line: string; mode: string; position?: [number, number] }
  const near = (t: Trip, lat: number, lon: number) =>
    t.position ? Math.hypot(t.position[0] - lat, (t.position[1] - lon) * 0.56) : 9
  for (const [line, lat0, lon0, label] of [['M1', 55.6839, 12.5711, 'Metro'], ['5C', 55.6677, 12.5898, 'Bus']] as const) {
    const trip = (snapshot.trips as Trip[]).filter((t) => t.line === line).sort((a, b) => near(a, lat0, lon0) - near(b, lat0, lon0))[0]
    const [lat, lon] = trip.position!
    const clat = lat - (250 * Math.cos(Math.PI / 6)) / 111320
    const clon = lon + (250 * Math.sin(Math.PI / 6)) / (111320 * Math.cos((lat * Math.PI) / 180))
    await page.goto(`/en?map=16.00/${clat.toFixed(5)}/${clon.toFixed(5)}/-30.0/60.0`)
    await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: 'Close' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Overview' })).toBeHidden()
    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(map).toHaveAttribute('data-tilt', '60', { timeout: 30000 })
    await page.waitForTimeout(15000)
    await step(`${line} up the street`)
    const chip = page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: new RegExp(`^${label}`) })
    const shown = await page.screenshot()
    await chip.click()
    await page.waitForTimeout(3000)
    const hidden = await page.screenshot()
    await step(`${line} ${label} chip off`)
    await chip.click()
    await page.waitForTimeout(2000)
    const spots: number[][] = await page.evaluate(async ([a, b]) => {
      const load = async (s: string) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob())
        const c = new OffscreenCanvas(bmp.width, bmp.height)
        const g = c.getContext('2d')!
        g.drawImage(bmp, 0, 0)
        return g.getImageData(0, 0, bmp.width, bmp.height)
      }
      const x = await load(a)
      const y = await load(b)
      const cells = new Map<string, number[]>()
      for (let i = 0; i < x.data.length; i += 4) {
        const d = Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2])
        const px = (i / 4) % x.width
        const py = Math.floor(i / 4 / x.width)
        if (d <= 120 || py < 60) continue
        const k = `${Math.floor(px / 30)},${Math.floor(py / 30)}`
        const c = cells.get(k) ?? [0, 0, 0]
        cells.set(k, [c[0] + px, c[1] + py, c[2] + 1])
      }
      return [...cells.values()].filter((c) => c[2] > 15).map((c) => [Math.round(c[0] / c[2]), Math.round(c[1] / c[2])])
    }, [shown.toString('base64'), hidden.toString('base64')])
    console.log(`${line}: ${label} dots drawn at ${JSON.stringify(spots)}`)
    expect(spots.length, `a ${label} dot drawn in view`).toBeGreaterThan(0)
    await step(`${line} chip back on`)
  }
}
