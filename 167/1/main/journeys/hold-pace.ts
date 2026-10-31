import { writeFileSync } from 'node:fs'
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { keyboard } from './keys.ts'

// Pass rule, second half: holding Shift + Right turns the map at a steady pace (a longer hold turns
// it further, at about the same degrees per second) and it stops soon after release.
// Holds of 1, 2 and 4 s, auto-repeating every 33 ms, each from a fresh north-up map.
export default async ({ page, step, expect }: Journey) => {
  const map = page.locator('[data-vehicles]')
  const runs: { holdMs: number; keydowns: number; heading: number; msFromReleaseToRest: number }[] = []
  for (const holdMs of [1000, 2000, 4000]) {
    await page.goto('/en')
    await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
    await expect(map).toHaveAttribute('data-heading', '0', { timeout: 30_000 })
    await page.waitForTimeout(1500)
    await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
    const keys = await keyboard(page)
    let tUp = 0
    const keydowns = await keys.hold('ArrowRight', holdMs, 33, () => {
      tUp = Date.now()
    })
    // Rest: data-heading is written once the map comes to rest; poll until it stops changing.
    let last = await map.getAttribute('data-heading')
    let changedAt = Date.now()
    while (Date.now() - changedAt < 2500) {
      await page.waitForTimeout(100)
      const now = await map.getAttribute('data-heading')
      if (now !== last) {
        last = now
        changedAt = Date.now()
      }
    }
    const heading = Number(last)
    runs.push({ holdMs, keydowns, heading, msFromReleaseToRest: Math.max(0, changedAt - tUp) })
    await step(`held ${holdMs} ms, rests at ${heading}`)
  }
  writeFileSync(`.verify/${process.argv[2]}/hold-pace/runs.json`, JSON.stringify(runs, null, 2))
  console.log(JSON.stringify(runs))
  for (const r of runs) {
    expect(r.heading, `a ${r.holdMs} ms hold turns the map`).toBeGreaterThan(0)
    expect(r.msFromReleaseToRest, `a ${r.holdMs} ms hold comes to rest within 1.5 s of release`).toBeLessThan(1500)
  }
  // Steady: each longer hold turns further, and the 4 s hold's pace is within half to double the 2 s hold's.
  expect(runs[1].heading).toBeGreaterThan(runs[0].heading)
  expect(runs[2].heading).toBeGreaterThan(runs[1].heading)
  const pace = (r: (typeof runs)[number]) => r.heading / r.holdMs
  expect(pace(runs[2]) / pace(runs[1])).toBeGreaterThan(0.5)
  expect(pace(runs[2]) / pace(runs[1])).toBeLessThan(2)
}
