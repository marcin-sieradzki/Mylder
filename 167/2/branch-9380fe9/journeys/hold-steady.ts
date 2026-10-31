import { writeFileSync } from 'node:fs'
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { keyboard } from './keys.ts'
import { clearTrace, installTrace, readTrace, unwrap } from './trace.ts'

// Pass rule: holding Shift + Right turns the map at a steady pace while held (the compass needle
// keeps moving, at about the same degrees a second for a 1, 2 or 4 s hold), and it stops soon
// after release (at rest within 1.5 s, no more than two 15° steps past where it was at release).
// Trusted CDP keydowns with autoRepeat every 33 ms (and one 3 s hold at 90 ms), not awaited.
// The live heading is the compass needle's rotation, read every animation frame.
export default async ({ page, step, expect }: Journey) => {
  await installTrace(page)
  const map = page.locator('[data-vehicles]')
  const runs: Record<string, unknown>[] = []
  const holds: [number, number][] = [[1000, 33], [2000, 33], [4000, 33], [3000, 90]]
  for (const [holdMs, everyMs] of holds) {
    await page.goto('/en')
    await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
    await expect(map).toHaveAttribute('data-heading', '0', { timeout: 30_000 })
    await page.waitForTimeout(1500)
    await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
    await clearTrace(page)
    const keys = await keyboard(page)
    const sent = await keys.hold('ArrowRight', holdMs, everyMs, () => {})
    await page.waitForTimeout(3000)
    const trace = await readTrace(page)
    const keydowns = trace.filter((e) => e[0] === 'key' && e[2] === 'ArrowRight')
    const tDown = keydowns[0][1]
    const tUp = trace.filter((e) => e[0] === 'up' && e[2] === 'ArrowRight').pop()![1]
    const frames = trace.filter((e) => e[0] === 'frame')
    const needle = unwrap(frames.map((f) => f[2] as number))
    const at = (t: number) => {
      let v = 0
      frames.forEach((f, i) => {
        if (f[1] <= t) v = needle[i]
      })
      return v
    }
    let lastMove = tDown
    for (let i = 1; i < frames.length; i++) if (needle[i] !== needle[i - 1]) lastMove = frames[i][1]
    const held = tUp - tDown
    // The heading at release: the frame drawn nearest the keyup (frames here are 100-350 ms apart).
    const nearest = frames.reduce((b, f, i) => (Math.abs(f[1] - tUp) < Math.abs(frames[b][1] - tUp) ? i : b), 0)
    const atRelease = needle[nearest]
    const final = needle[needle.length - 1]
    const windows: number[] = []
    for (let t = tDown; t + 500 <= tUp; t += 500) windows.push(at(t + 500) - at(t))
    const firstHalf = at(tDown + held / 2) - at(tDown)
    const secondHalf = atRelease - at(tDown + held / 2)
    const run = {
      holdMs,
      everyMs,
      keydownsSent: sent,
      keydownsSeen: keydowns.length,
      heldMs: held,
      framesDuringHold: frames.filter((f) => f[1] >= tDown && f[1] <= tUp).length,
      headingAtRelease: atRelease,
      finalHeading: final,
      dataHeading: await map.getAttribute('data-heading'),
      degPerSecWhileHeld: Math.round((atRelease / held) * 1000),
      degPerSecHeld: Math.round((final / held) * 1000),
      degAfterRelease: final - atRelease,
      msReleaseToRest: lastMove - tUp,
      firstHalf,
      secondHalf,
      per500ms: windows,
    }
    runs.push(run)
    writeFileSync(`.verify/${process.argv[2]}/hold-steady/trace-${holdMs}-${everyMs}.json`, JSON.stringify({ run, trace: trace.map((e) => [e[0], e[1] - tDown, ...e.slice(2)]) }))
    console.log(JSON.stringify(run))
    await step(`held ${holdMs} ms every ${everyMs} ms: ${atRelease} at release, rests at ${final}`)
  }
  writeFileSync(`.verify/${process.argv[2]}/hold-steady/runs.json`, JSON.stringify(runs, null, 2))
  const errors: string[] = []
  for (const r of runs as any[]) {
    const tag = `${r.holdMs} ms hold (repeat ${r.everyMs} ms)`
    if (r.degPerSecWhileHeld < 15) errors.push(`${tag}: turned only ${r.headingAtRelease}° while held (${r.degPerSecWhileHeld}°/s)`)
    if (r.per500ms.slice(1).some((d: number) => d < 10)) errors.push(`${tag}: stalled while held, per 500 ms ${r.per500ms.join(',')}`)
    const steady = r.per500ms.slice(1)
    if (steady.length > 1 && Math.max(...steady) > 2.5 * Math.min(...steady)) errors.push(`${tag}: uneven, per 500 ms ${r.per500ms.join(',')}`)
    if (r.msReleaseToRest > 1500) errors.push(`${tag}: still moving ${r.msReleaseToRest} ms after release`)
    if (r.degAfterRelease > 30) errors.push(`${tag}: lurched ${r.degAfterRelease}° after release`)
  }
  // Pace as the rider gets it: how far the map ends up turned for each second the key was held.
  // (The first rotated frame takes ~0.5 s on this software renderer, on main too, so the heading at
  // release under-reads short holds; the first 500 ms window is left out of the stall check for that.)
  const pace = (runs as any[]).slice(0, 3).map((r) => r.degPerSecHeld)
  if (Math.max(...pace) > 2 * Math.min(...pace)) errors.push(`pace differs between 1, 2 and 4 s holds: ${pace.join(', ')} °/s`)
  const finals = (runs as any[]).slice(0, 3).map((r) => r.finalHeading)
  if (!(finals[0] < finals[1] && finals[1] < finals[2])) errors.push(`longer holds don't turn further: ${finals.join(', ')}`)
  expect(errors, errors.join('; ')).toEqual([])
}
