import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ready, map, scale, camera, touchGesture, twist } from './lib.ts'
// A tablet: wider than breakpoint.phone (760 px), with touch. Its own context, with screenshots of its own.
export default async ({ page, step, expect }: Journey) => {
  const base = new URL(page.url() === 'about:blank' ? 'http://x' : page.url())
  const port = (await import('node:fs')).readFileSync(join('.verify', process.argv[2], 'port'), 'utf8').trim()
  const out = join('.verify', process.argv[2], 'pr04b-touch-tablet')
  mkdirSync(out, { recursive: true })
  const ctx = await page.context().browser()!.newContext({
    viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    baseURL: `http://localhost:${port}`,
  })
  const tab = await ctx.newPage()
  let n = 0
  const shot = async (name: string) => tab.screenshot({ path: join(out, `t${++n}-${name}.png`) })
  try {
    await tab.goto('/en')
    await ready(tab, expect)
    await shot('tablet-open')
    console.log('open', JSON.stringify(await camera(tab)))
    const c = { x: 700, y: 900 }
    // two fingers, side by side, dragged up together: tilt
    await touchGesture(tab, [{ x: c.x - 60, y: c.y }, { x: c.x + 60, y: c.y }], [{ x: c.x - 60, y: c.y - 200 }, { x: c.x + 60, y: c.y - 200 }], 20, 30)
    await expect(map(tab)).not.toHaveAttribute('data-tilt', '0', { timeout: 10000 })
    await tab.waitForTimeout(1000)
    console.log('two-finger drag', JSON.stringify(await camera(tab)))
    await shot('two-finger-drag-up-tilted')
    await expect(scale(tab)).toBeHidden()
    // two fingers twisted 60 degrees: turn
    const tw = twist(c, 120, 0, 60)
    await touchGesture(tab, tw.from, tw.to, 20, 30)
    await expect(map(tab)).not.toHaveAttribute('data-heading', '0', { timeout: 10000 })
    await tab.waitForTimeout(1000)
    console.log('two-finger twist', JSON.stringify(await camera(tab)))
    await shot('two-finger-twist-turned')
  } finally {
    await shot('end').catch(() => {})
    await ctx.close()
  }
  await page.goto('/en')
  await step('desktop page (unused)')
}
