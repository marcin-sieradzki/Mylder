import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { writeFileSync } from 'node:fs'
// Pass rules 1 and 2: a late bus is a hollow Estimated dot ("Estimated from schedule"), drawn behind
// where its timetable puts it: short, along its own path, of a stop whose planned departure has
// already passed. LATE_KEY names the trip to look at instead (for main's before).
export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  const updated = page.getByRole('banner').getByText(/^Updated \d\d:\d\d:\d\d$/)
  await expect(updated).toBeVisible()
  await step('map open')
  const snap = await (await page.request.get('/api/snapshot')).json()
  const v = snap.timetableVersion
  const want = process.env.LATE_KEY
  const cands = snap.trips.filter((t: any) => (want ? t.key === want : t.mode === 'bus' && t.state === 'estimated' && t.delay >= 240 && !t.cancelled))
  expect(cands.length, want ? `${want} in /api/snapshot` : 'a late Estimated bus (delay >= 240 s)').toBeGreaterThan(0)
  const t = cands[0]
  const d = await (await page.request.get(`/api/trips/${t.key}`)).json()
  const patterns = await (await page.request.get(`/api/timetable/${v}/patterns`)).json()
  const paths = await (await page.request.get(`/api/timetable/${v}/paths`)).json()
  const pat = patterns.patterns[t.pattern]
  // the whole path with each stop's distance along it
  const pts: number[][] = []; const cum: number[] = []; const stopAt: number[] = [0]
  const m = (a: number[], b: number[]) => Math.hypot((b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180), (b[0] - a[0]) * 111320)
  for (const seg of pat.segments) {
    for (const p of decode(paths.segments[seg])) { if (pts.length) { cum.push(cum[cum.length - 1] + m(pts[pts.length - 1], p)) } else cum.push(0); pts.push(p) }
    stopAt.push(cum[cum.length - 1])
  }
  await page.goto(`/en?map=15.00/${t.position[0].toFixed(5)}/${t.position[1].toFixed(5)}`)
  await expect(updated).toBeVisible()
  await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
  await page.getByRole('button', { name: 'Pause' }).click()
  const pausedAt = await updated.innerText()
  const now = Date.now()
  await step(`centred on ${t.line} paused`)
  const vp = page.viewportSize()!
  const c0 = [t.position[0], t.position[1]]
  const mpp = (40075016.686 * Math.cos((c0[0] * Math.PI) / 180)) / (512 * 2 ** 15)
  const toScreen = (p: number[]) => [vp.width / 2 + ((p[1] - c0[1]) * 111320 * Math.cos((c0[0] * Math.PI) / 180)) / mpp, vp.height / 2 - ((p[0] - c0[0]) * 111320) / mpp]
  const walk: { xy: number[]; along: number }[] = []
  for (let k = 1; k < pts.length; k++) {
    const a = toScreen(pts[k - 1]), b = toScreen(pts[k]); const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3))
    for (let j = 0; j < n; j++) { const f = j / n; walk.push({ xy: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], along: cum[k - 1] + (cum[k] - cum[k - 1]) * f }) }
  }
  const onMap = ([x, y]: number[]) => x > 395 && x < 1215 && y > 170 && y < 700 && !(x < 640 && y > 500)
  const order = walk.filter((w) => onMap(w.xy)).sort((p, q) => Math.hypot(p.xy[0] - vp.width / 2, p.xy[1] - vp.height / 2) - Math.hypot(q.xy[0] - vp.width / 2, q.xy[1] - vp.height / 2))
  const tip = page.getByRole('tooltip')
  const re = new RegExp(`Bus ${t.line} to ${t.headsign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  let hit: any
  for (const w of order) {
    await page.mouse.move(w.xy[0], w.xy[1])
    if ((await tip.isVisible()) && re.test(await tip.innerText())) { hit = { ...w, tooltip: (await tip.innerText()).replace(/\s+/g, ' ') }; break }
  }
  if (hit) await step(`hover ${t.line} on its path`)
  // the stop the timetable alone has it past: the last call whose planned departure was before the snapshot
  const passed = d.calls.filter((c: any) => c.departure < snap.fetched).pop()
  const res = { key: t.key, line: t.line, state: t.state, delay: t.delay, fetched: new Date(snap.fetched).toISOString(), pausedAt, scanSeconds: (Date.now() - now) / 1000,
    dot: hit && { metresAlongPath: Math.round(hit.along), tooltip: hit.tooltip },
    timetablePast: passed && { stop: passed.name, index: passed.index, metresAlongPath: Math.round(stopAt[passed.index]), plannedDeparture: new Date(passed.departure).toISOString(), expectedDeparture: passed.expectedDeparture && new Date(passed.expectedDeparture).toISOString() } }
  console.log(JSON.stringify(res))
  writeFileSync(`.verify/late-${process.env.RUN_TAG ?? 'x'}.json`, JSON.stringify(res, null, 1))
  expect(hit, `the ${t.line} dot found on its path`).toBeTruthy()
  expect(hit.tooltip).toMatch(/Estimated from schedule/)
  expect(t.state).toBe('estimated')
  expect(passed, 'a call whose planned departure has passed').toBeTruthy()
  expect(hit.along, `drawn short of ${passed.name}, which the timetable alone has it past`).toBeLessThan(stopAt[passed.index] - 10)
}
function decode(e: string) {
  const out: number[][] = []; let i = 0, lat = 0, lon = 0
  const nx = () => { let r = 0, sh = 0, by; do { by = e.charCodeAt(i++) - 63; r |= (by & 0x1f) << sh; sh += 5 } while (by >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1 }
  while (i < e.length) { lat += nx(); lon += nx(); out.push([lat / 1e5, lon / 1e5]) }
  return out
}
