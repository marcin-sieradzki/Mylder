import { writeFileSync } from 'node:fs'
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { keyboard } from './keys.ts'
import { clearTrace, installTrace, readTrace, type Entry } from './trace.ts'

// Drives the compass, the 3D toggle and Centre the map, tracing the needle and data-tilt per frame,
// and reports for each move how many frames it took and how many in-between needle angles it drew.
export async function motion({ page, step, expect }: Journey, reduced: boolean, name: string) {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
  await installTrace(page)
  const map = page.locator('[data-vehicles]')
  const region = page.getByRole('region', { name: 'Live map of Copenhagen' })
  const compass = page.getByRole('button', { name: 'Reset to north' })
  const toggle = page.getByRole('button', { name: '3D view' })
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  await expect(map).toHaveAttribute('data-heading', '0', { timeout: 30_000 })
  await page.waitForTimeout(1500)
  const report: Record<string, unknown> = { reduced }
  // A move: clear, act, wait for the attribute, wait to settle, then summarise the frames.
  const move = async (label: string, act: () => Promise<void>, attr: string, value: string, from: number, to: number) => {
    await clearTrace(page)
    await act()
    await expect(map).toHaveAttribute(attr, value, { timeout: 15_000 })
    await page.waitForTimeout(1200)
    const trace = await readTrace(page)
    const start = trace.find((e) => e[0] === 'key' || e[0] === 'click')?.[1] ?? trace[0][1]
    const frames = trace.filter((e) => e[0] === 'frame' && e[1] >= start) as Entry[]
    const col = attr === 'data-heading' ? 3 : 4
    const reached = frames.find((f) => f[col] === value)
    const needles = [...new Set(frames.map((f) => f[2] as number))]
    const between = needles.filter((n) => n !== from && n !== to && Math.min(from, to) < n && n < Math.max(from, to))
    const r = {
      msToAttr: reached ? reached[1] - start : null,
      framesToAttr: reached ? frames.indexOf(reached) : null,
      needleAngles: frames.map((f) => f[2]).filter((v, i, a) => i === 0 || v !== a[i - 1]),
      needleBetween: between.length,
    }
    report[label] = r
    console.log(label, JSON.stringify(r))
    return r
  }
  await region.focus()
  const turn = await move('Shift+Right once', () => page.keyboard.press('Shift+ArrowRight'), 'data-heading', '15', 0, 15)
  await page.keyboard.press('Shift+ArrowRight')
  await page.waitForTimeout(800)
  await page.keyboard.press('Shift+ArrowRight')
  await expect(map).toHaveAttribute('data-heading', '45', { timeout: 15_000 })
  await page.waitForTimeout(1000)
  await step('turned to 45')
  const north = await move('compass', () => compass.click(), 'data-heading', '0', 45, 0)
  await step('compass: back to north')
  const tilt = await move('3D toggle on', () => toggle.click(), 'data-tilt', '50', 0, 50)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await step('3D toggle: tilted 50')
  await region.focus()
  await page.keyboard.press('Shift+ArrowRight')
  await page.waitForTimeout(800)
  await page.keyboard.press('Shift+ArrowRight')
  await expect(map).toHaveAttribute('data-heading', '30', { timeout: 15_000 })
  await page.waitForTimeout(1000)
  await step('tilted 50, turned 30')
  const centre = await move('Centre the map', () => page.getByRole('button', { name: 'Centre the map' }).click(), 'data-tilt', '0', 30, 0)
  await expect(map).toHaveAttribute('data-heading', '0')
  await step('centred: flat and north-up')
  writeFileSync(`.verify/${process.argv[2]}/${name}/report.json`, JSON.stringify(report, null, 2))
  // Three quick presses still count three steps under either setting.
  await region.focus()
  const keys = await keyboard(page)
  await keys.quick('ArrowUp', 3, 60)
  await expect(map).toHaveAttribute('data-tilt', '30', { timeout: 15_000 })
  await page.waitForTimeout(1500)
  await expect(map).toHaveAttribute('data-tilt', '30')
  await step('three quick Shift+Up: tilt 30')
  const errors: string[] = []
  const moves = { 'Shift+Right': turn, compass: north, 'Centre the map': centre }
  if (reduced) {
    for (const [k, r] of Object.entries(moves)) if (r.needleBetween > 0) errors.push(`${k} swept the needle through ${r.needleBetween} angles`)
    if ((tilt.framesToAttr ?? 99) > 3) errors.push(`3D toggle took ${tilt.framesToAttr} frames (${tilt.msToAttr} ms) to reach 50`)
  } else {
    // A single key step's 300 ms ease fits inside the first rotated frame (~700 ms on this software
    // renderer), so it is recorded but not judged here; the compass and Centre the map are.
    for (const [k, r] of Object.entries(moves)) if (k !== 'Shift+Right' && r.needleBetween < 1) errors.push(`${k} jumped (${r.needleBetween} in-between needle angles)`)
    if ((tilt.framesToAttr ?? 0) < 4 || (tilt.msToAttr ?? 0) < 250) errors.push(`3D toggle reached 50 in ${tilt.framesToAttr} frames, ${tilt.msToAttr} ms`)
  }
  expect(errors, errors.join('; ')).toEqual([])
}
