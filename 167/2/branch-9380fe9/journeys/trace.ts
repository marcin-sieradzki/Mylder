import type { Page } from '@playwright/test'

// In-page trace: every animation frame logs the compass needle's angle (the live heading),
// data-tilt and data-heading; every keydown, keyup and click its time. Times are performance.now().
export type Entry = [string, number, ...unknown[]]
export async function installTrace(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __trace: unknown[] }
    w.__trace = []
    window.addEventListener('keydown', (e) => w.__trace.push(['key', Math.round(performance.now()), e.key, e.repeat]), { capture: true })
    window.addEventListener('keyup', (e) => w.__trace.push(['up', Math.round(performance.now()), e.key]), { capture: true })
    window.addEventListener('click', () => w.__trace.push(['click', Math.round(performance.now())]), { capture: true })
    const frame = () => {
      const button = document.querySelector('button[aria-label="Reset to north"]')
      const el = button && [button, ...button.querySelectorAll('*')].find((e) => getComputedStyle(e).transform !== 'none')
      const m = el ? new DOMMatrix(getComputedStyle(el).transform) : null
      const heading = m ? Math.round((-Math.atan2(m.b, m.a) * 180) / Math.PI) : 0
      const map = document.querySelector('[data-vehicles]')
      w.__trace.push(['frame', Math.round(performance.now()), heading, map?.getAttribute('data-heading'), map?.getAttribute('data-tilt')])
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
}
export const clearTrace = (page: Page) => page.evaluate(() => ((window as unknown as { __trace: unknown[] }).__trace.length = 0))
export const readTrace = async (page: Page) => (await page.evaluate(() => (window as unknown as { __trace: unknown[] }).__trace)) as Entry[]

/** Unwraps a needle angle series so it can pass 180 without jumping to -180. */
export function unwrap(values: number[]) {
  const out: number[] = []
  let offset = 0
  values.forEach((v, i) => {
    if (i > 0) {
      const d = v + offset - out[i - 1]
      if (d < -180) offset += 360
      else if (d > 180) offset -= 360
    }
    out.push(v + offset)
  })
  return out
}
