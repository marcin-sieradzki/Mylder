// Pass rule: once the feed is quiet, every trip that had an update shows No signal (its dot's card, and
// its panel "No signal since 09:56; moving on the timetable and its last delay."), and keeps moving.
import { type Journey, snapshot, untilQuiet, sleep } from './lib.ts'
export default async ({ page, step, expect }: Journey) => {
  const { quiet } = await untilQuiet(page, 120_000)
  const a = quiet
  for (const t of a.trips) expect(t.state, t.key).toBe(t.updated ? 'no-signal' : 'timetable-only')
  const ns = a.trips.filter((t: any) => t.state === 'no-signal' && !t.cancelled)
  expect(ns.length).toBeGreaterThan(0)
  for (const t of ns) expect(typeof t.delay, `${t.key} keeps its delay`).toBe('number')
  console.log('no-signal', ns.length, 'timetable-only', a.trips.filter((t: any) => t.state === 'timetable-only').length)
  await page.goto('/en')
  await expect(page.locator('[data-vehicles]')).toHaveAttribute('data-vehicles', /\d+/)
  await expect.poll(async () => {
    const s = await snapshot(page)
    return Number(await page.locator('[data-vehicles]').getAttribute('data-vehicles')) - s.trips.filter((t: any) => !t.cancelled).length
  }, { timeout: 30_000 }).toBe(0)
  await step('map with the feed quiet')
  // a No signal bus underway, with a delay of a minute or more
  const bus = ns.find((t: any) => t.mode === 'bus' && !t.waiting && Math.abs(t.delay) >= 60) ?? ns.find((t: any) => t.mode === 'bus' && !t.waiting)
  if (!bus) throw new Error('precondition: no No signal bus underway')
  console.log('bus', bus.key, bus.line, bus.headsign, bus.delay, bus.progress)
  await page.goto(`/en?map=15.00/${bus.position[0].toFixed(5)}/${bus.position[1].toFixed(5)}`)
  await page.getByRole('button', { name: 'Pause' }).click()
  await step('centred on a No signal bus, paused')
  const vp = page.viewportSize()!
  let at: number[] = []
  await expect(async () => {
    const pts: number[][] = []
    for (let r = 0; r <= 220; r += 6) for (let a = 0; a < 360; a += r ? 15 : 360) pts.push([r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180)])
    for (const [dx, dy] of pts) {
      await page.mouse.move(vp.width / 2 + dx, vp.height / 2 + dy)
      const tip = page.getByRole('tooltip')
      if (await tip.isVisible() && /No signal/.test(await tip.innerText())) { at = [dx, dy]; break }
    }
    await expect(page.getByRole('tooltip')).toContainText('No signal', { timeout: 500 })
  }).toPass({ timeout: 90_000 })
  const tipText = await page.getByRole('tooltip').innerText()
  console.log('tooltip', JSON.stringify(tipText))
  await step('hover card says No signal')
  await page.mouse.click(vp.width / 2 + at[0], vp.height / 2 + at[1])
  const panel = page.getByRole('dialog', { name: / to / })
  await expect(panel).toBeVisible()
  const key = new URL(page.url()).searchParams.get('trip')
  expect(key).toBeTruthy()
  await expect(panel).toContainText('No signal since 09:56; moving on the timetable and its last delay.')
  console.log('opened', key, JSON.stringify((await panel.innerText()).slice(0, 600)))
  await step('panel says No signal since 09:56')
  // keeps moving: the same trip's progress grows at the next snapshot
  const t0 = a.trips.find((t: any) => t.key === key) ?? bus
  let b: any
  await expect.poll(async () => { b = await snapshot(page); return b.fetched > a.fetched }, { timeout: 90_000, intervals: [5000] }).toBe(true)
  const t1 = b.trips.find((t: any) => t.key === t0.key)
  console.log('progress', t0.key, t0.progress, '->', t1?.progress, 'delay', t0.delay, '->', t1?.delay, 'state', t1?.state)
  expect(t1.state).toBe('no-signal')
  expect(t1.progress).toBeGreaterThan(t0.progress)
  const grew = ns.filter((t: any) => { const u = b.trips.find((x: any) => x.key === t.key); return u && u.progress > t.progress }).length
  console.log(`no-signal trips whose progress grew: ${grew} of ${ns.length}`)
  await page.getByRole('button', { name: 'Play' }).click().catch(() => {})
  await sleep(3000)
  await step('a minute on, still moving')
}
