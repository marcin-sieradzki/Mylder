import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { ready, sleep, tiltTo } from './lib.ts'
// Pass rule 7: vehicles keep moving smoothly in a tilted map with the buildings on.
export default async ({ page, step, expect }: Journey) => {
  const snap = await (await page.request.get('/api/snapshot')).json()
  const bus = snap.trips.find((t: any) => t.mode === 'bus' && t.position[0] > 55.66 && t.position[0] < 55.70 && t.position[1] > 12.55) ?? snap.trips.find((t: any) => t.mode === 'bus')
  await page.goto(`/en?map=15.00/${bus.position[0]}/${bus.position[1]}`)
  await ready(page, expect)
  await tiltTo(page, 5)
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-tilt', '50', { timeout: 15000 })
  await sleep(8000)
  await step('tilted 50, buildings on, t=0')
  const fps = await page.evaluate(() => new Promise<number>((done) => {
    let n = 0; const t0 = performance.now()
    const tick = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(tick); else done(n / ((performance.now() - t0) / 1000)) }
    requestAnimationFrame(tick)
  }))
  console.log(`rAF rate tilted with buildings: ${fps.toFixed(1)} fps`)
  await step(`tilted 50, t=5s, ${fps.toFixed(1)} fps`)
  const shots: Buffer[] = []
  for (let i = 0; i < 3; i++) { shots.push(await page.screenshot()); await sleep(1000) }
  await step('tilted 50, t=8s')
  const differ = !shots[0].equals(shots[1]) || !shots[1].equals(shots[2])
  console.log(`frames differ over 3 s: ${differ}`)
  expect(differ, 'the map shows motion over three seconds').toBe(true)
  await expect.poll(async () => Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles'))).toBeGreaterThan(0)
}
