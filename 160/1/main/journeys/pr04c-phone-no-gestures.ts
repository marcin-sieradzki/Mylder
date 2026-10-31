import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, map, camera, touchGesture, twist, viewportMiddle } from './lib.ts'
// Run with --phone (Pixel 7, 412 px wide: under breakpoint.phone)
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await ready(page, expect)
  const v = page.viewportSize()!
  const c = { x: v.width / 2, y: 330 }
  await step('phone, flat')
  console.log('open', JSON.stringify(await camera(page)))
  await touchGesture(page, [{ x: c.x - 60, y: c.y + 100 }, { x: c.x + 60, y: c.y + 100 }], [{ x: c.x - 60, y: c.y - 100 }, { x: c.x + 60, y: c.y - 100 }], 20, 30)
  await page.waitForTimeout(2500)
  const a = await camera(page)
  console.log('after two-finger drag', JSON.stringify(a))
  await step('after two-finger drag up: still flat')
  expect(a.tilt).toBe('0')
  expect(a.heading).toBe('0')
  const tw = twist(c, 100, 0, 60)
  await touchGesture(page, tw.from, tw.to, 20, 30)
  await page.waitForTimeout(2500)
  const b = await camera(page)
  console.log('after two-finger twist', JSON.stringify(b))
  await step('after two-finger twist: still north-up')
  expect(b.tilt).toBe('0')
  expect(b.heading).toBe('0')
  // a right-drag at phone size
  await page.mouse.move(c.x, c.y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(c.x + 120, c.y - 60, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(2500)
  const d = await camera(page)
  console.log('after right-drag', JSON.stringify(d))
  await step('after right-drag: still flat and north-up')
  expect(d.tilt).toBe('0')
  expect(d.heading).toBe('0')
}
