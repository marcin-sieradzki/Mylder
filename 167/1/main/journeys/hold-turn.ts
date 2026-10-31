import { writeFileSync } from 'node:fs'
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { keyboard } from './keys.ts'

// Pass rule: holding Shift + Right turns the map at a steady pace, and it stops soon after release.
// The key is held 3 s, auto-repeating every 33 ms (keydown with repeat), then released.
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  const map = page.locator('[data-vehicles]')
  await expect(map).toHaveAttribute('data-heading', '0', { timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.getByRole('region', { name: 'Live map of Copenhagen' }).focus()
  await step('north-up, map focused')
  // The compass needle follows the heading as the map turns; read its rotation as the live heading.
  const needle = () =>
    page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Reset to north')
      if (!button) return null
      const el = [button, ...button.querySelectorAll('*')].find((e) => getComputedStyle(e).transform !== 'none')
      if (!el) return 0
      const m = new DOMMatrix(getComputedStyle(el).transform)
      return Math.round((-Math.atan2(m.b, m.a) * 180) / Math.PI)
    })
  const samples: { t: number; phase: string; needle: number | null; heading: string | null }[] = []
  const t0 = Date.now()
  let released = false
  let tUp = 0
  const sampling = (async () => {
    while (Date.now() - t0 < 12_000) {
      samples.push({ t: Date.now() - t0, phase: released ? 'released' : 'held', needle: await needle(), heading: await map.getAttribute('data-heading') })
      await page.waitForTimeout(100)
    }
  })()
  const keys = await keyboard(page)
  const n = await keys.hold('ArrowRight', 3000, 33, () => {
    released = true
    tUp = Date.now() - t0
  })
  const tHandled = Date.now() - t0
  await sampling
  // Rest: the first sample after which the needle and data-heading never change again.
  const last = samples[samples.length - 1]
  let restIdx = samples.length - 1
  while (restIdx > 0 && samples[restIdx - 1].needle === last.needle && samples[restIdx - 1].heading === last.heading) restIdx--
  const restAt = samples[restIdx].t
  const report = { keydowns: n, releasedAtMs: tUp, allKeysHandledAtMs: tHandled, restAtMs: restAt, msFromReleaseToRest: restAt - tUp, finalHeading: last.heading, samples }
  writeFileSync(`.verify/${process.argv[2]}/hold-turn/samples.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, samples: undefined }))
  console.log(samples.map((s) => `${s.t}${s.phase[0]}:${s.needle}/${s.heading}`).join(' '))
  await step('after release, at rest')
  const final = Number(last.heading)
  expect(final, 'turned during the hold').toBeGreaterThan(0)
  expect(restAt - tUp, 'comes to rest within 1.5 s of release').toBeLessThan(1500)
}
