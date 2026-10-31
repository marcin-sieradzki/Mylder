import { writeFileSync } from 'node:fs'
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { keyboard } from './keys.ts'
import { clearTrace, installTrace, readTrace } from './trace.ts'

// Pass rule: holding Shift + Up tilts the map while held, up to the 60° limit and no further, and it
// comes to rest soon after release; the 3D toggle shows pressed and the address carries a 60° tilt.
// Trusted CDP keydowns with autoRepeat every 33 ms, not awaited. A 1 s hold first, then a 4 s one.
export default async ({ page, step, expect }: Journey) => {
  await installTrace(page)
  const map = page.locator('[data-vehicles]')
  const runs: Record<string, unknown>[] = []
  for (const holdMs of [1000, 4000]) {
    await page.goto('/en')
    await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
    await expect(map).toHaveAttribute('data-tilt', '0', { timeout: 30_000 })
    await page.waitForTimeout(1500)
    await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
    await step(`flat before a ${holdMs} ms hold`)
    await clearTrace(page)
    const keys = await keyboard(page)
    await keys.hold('ArrowUp', holdMs, 33, () => {})
    await page.waitForTimeout(3000)
    const trace = await readTrace(page)
    const tDown = trace.find((e) => e[0] === 'key' && e[2] === 'ArrowUp')![1]
    const tUp = trace.filter((e) => e[0] === 'up' && e[2] === 'ArrowUp').pop()![1]
    const frames = trace.filter((e) => e[0] === 'frame')
    const tilts = frames.map((f) => [f[1] - tDown, f[4]])
    const changes = tilts.filter((t, i) => i > 0 && t[1] !== tilts[i - 1][1])
    const lastChange = changes.length ? (changes[changes.length - 1][0] as number) : 0
    const run = {
      holdMs,
      heldMs: tUp - tDown,
      framesDuringHold: frames.filter((f) => f[1] >= tDown && f[1] <= tUp).length,
      dataTiltChanges: changes,
      restMsAfterRelease: lastChange - (tUp - tDown),
      tilt: await map.getAttribute('data-tilt'),
      url: page.url(),
      toggle: await page.getByRole('button', { name: '3D view' }).getAttribute('aria-pressed'),
    }
    runs.push(run)
    console.log(JSON.stringify(run))
    await step(`held ${holdMs} ms, rests at tilt ${run.tilt}`)
  }
  writeFileSync(`.verify/${process.argv[2]}/hold-tilt/runs.json`, JSON.stringify(runs, null, 2))
  const [short, long] = runs as any[]
  expect(Number(short.tilt), 'a 1 s hold tilts the map').toBeGreaterThan(0)
  expect(short.restMsAfterRelease, 'the 1 s hold rests within 1.5 s of release').toBeLessThan(1500)
  expect(long.tilt, 'a 4 s hold reaches the 60° limit').toBe('60')
  expect(long.restMsAfterRelease, 'the 4 s hold rests within 1.5 s of release').toBeLessThan(1500)
  expect(long.toggle).toBe('true')
  await expect(page).toHaveURL(/map=[\d.]+\/[\d.]+\/[\d.]+\/0\.0\/60\.0$/)
  await expect(page.getByText(/\d+\s(m|km)$/)).toBeHidden()
}
