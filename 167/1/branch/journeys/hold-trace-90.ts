import { writeFileSync } from 'node:fs'
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { keyboard } from './keys.ts'

// Pass rule, held key, traced from inside the page: every animation frame logs the compass
// needle's angle (the live heading) and every keydown its time, over a 3 s hold of Shift + Right
// auto-repeating every 90 ms (a slower keyboard repeat), and 3 s after release.
export default async ({ page, step, expect }: Journey) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __trace: unknown[] }
    w.__trace = []
    window.addEventListener('keydown', (e) => w.__trace.push(['key', Math.round(performance.now()), e.key, e.repeat]), { capture: true })
    window.addEventListener('keyup', (e) => w.__trace.push(['up', Math.round(performance.now()), e.key]), { capture: true })
    const frame = () => {
      const button = document.querySelector('button[aria-label="Reset to north"]')
      const el = button && [button, ...button.querySelectorAll('*')].find((e) => getComputedStyle(e).transform !== 'none')
      const m = el ? new DOMMatrix(getComputedStyle(el).transform) : null
      const heading = m ? Math.round((-Math.atan2(m.b, m.a) * 180) / Math.PI) : 0
      const map = document.querySelector('[data-vehicles]')
      w.__trace.push(['frame', Math.round(performance.now()), heading, map?.getAttribute('data-heading')])
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  const map = page.locator('[data-vehicles]')
  await expect(map).toHaveAttribute('data-heading', '0', { timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  await step('north-up, map focused')
  await page.evaluate(() => ((window as unknown as { __trace: unknown[] }).__trace.length = 0))
  const keys = await keyboard(page)
  await keys.hold('ArrowRight', 3000, 90, () => {})
  await page.waitForTimeout(3000)
  const trace = (await page.evaluate(() => (window as unknown as { __trace: unknown[] }).__trace)) as [string, number, ...unknown[]][]
  await step('3 s after release')
  const t0 = trace[0]?.[1] ?? 0
  const lastUp = trace.filter((e) => e[0] === 'up').pop()?.[1] ?? 0
  const keydowns = trace.filter((e) => e[0] === 'key' && e[2] === 'ArrowRight')
  const frames = trace.filter((e) => e[0] === 'frame')
  const atRelease = frames.filter((f) => f[1] <= lastUp).pop()
  const lastMove = frames.reduce((acc, f, i) => (i > 0 && f[2] !== frames[i - 1][2] ? f : acc), frames[0])
  const summary = {
    keydownsHandled: keydowns.length,
    firstKeyMs: keydowns[0][1] - t0,
    lastKeyMs: keydowns[keydowns.length - 1][1] - t0,
    releaseMs: lastUp - t0,
    framesDuringHold: frames.filter((f) => f[1] <= lastUp).length,
    framesAfterRelease: frames.filter((f) => f[1] > lastUp).length,
    headingAtRelease: atRelease?.[2],
    finalHeading: frames[frames.length - 1][2],
    lastMoveMsAfterRelease: lastMove[1] - lastUp,
    headingEach500ms: [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000].map((ms) => [ms, frames.filter((f) => f[1] - t0 <= ms).pop()?.[2]]),
  }
  writeFileSync(`.verify/${process.argv[2]}/hold-trace-90/trace.json`, JSON.stringify({ summary, trace: trace.map((e) => [e[0], e[1] - t0, ...e.slice(2)]) }, null, 1))
  console.log(JSON.stringify(summary))
  expect(Number(summary.finalHeading)).toBeGreaterThan(0)
  expect(summary.lastMoveMsAfterRelease).toBeLessThan(1500)
}
