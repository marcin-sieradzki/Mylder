import { readFileSync } from 'node:fs'
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'

// map-delays, "A hollow Estimated dot, late": a late Estimated bus is drawn short of the stop
// its timetable alone has it past.
type LatLon = [number, number]
const decode = (s: string): LatLon[] => {
  let i = 0, lat = 0, lon = 0
  const out: LatLon[] = []
  while (i < s.length) {
    for (let k = 0; k < 2; k++) {
      let r = 0, sh = 0, b: number
      do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5 } while (b >= 32)
      const v = r & 1 ? ~(r >> 1) : r >> 1
      if (k === 0) lat += v; else lon += v
    }
    out.push([lat / 1e5, lon / 1e5])
  }
  return out
}
const world = (z: number) => 512 * 2 ** z
const project = ([lat, lon]: LatLon, z: number) => {
  const W = world(z), r = (lat * Math.PI) / 180
  return [((lon + 180) / 360) * W, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * W]
}
const metres = (a: LatLon, b: LatLon) => {
  const dy = (a[0] - b[0]) * 111320, dx = (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

export default async ({ page, step, expect }: Journey) => {
  await page.goto('/en')
  await expect(page.getByRole('banner').getByText(/^Updated /)).toBeVisible()
  const snap = await (await page.request.get('/api/snapshot')).json()
  const dir = `recordings/siri-et/timetable/${snap.timetableVersion}`
  const platforms = JSON.parse(readFileSync(`${dir}/stops.json`, 'utf8')).platforms
  const patterns = JSON.parse(readFileSync(`${dir}/patterns.json`, 'utf8')).patterns
  const segments: string[] = JSON.parse(readFileSync(`${dir}/paths.json`, 'utf8')).segments

  let pick: any
  for (const t of snap.trips) {
    if (t.mode !== 'bus' || t.state !== 'estimated' || (t.delay ?? 0) < 180 || t.cancelled) continue
    const d = await (await page.request.get(`/api/trips/${t.key}`)).json()
    // The stop it is heading for by its expected times: the first call it hasn't left.
    const ahead = d.calls.filter((x: any) => (x.expectedDeparture ?? x.departure) > snap.fetched)
    const c = ahead[0]
    if (!c || c.index < 1 || c.expectedArrival == null) continue
    if (c.departure < snap.fetched && c.expectedArrival - snap.fetched >= 60000) {
      pick = { t, d, k: c.index, c }
      break
    }
  }
  expect(pick, 'a late Estimated bus under way whose next stop is planned before the snapshot and expected over 60 s after it').toBeTruthy()
  const { t, d, k, c } = pick
  console.log('trip', t.key, t.line, t.headsign, 'delay', t.delay, 'next', k, c.name,
    'planned', new Date(c.departure).toISOString(), 'expected', new Date(c.expectedDeparture).toISOString(),
    'fetched', new Date(snap.fetched).toISOString())
  expect(d.state).toBe('estimated')
  expect(c.expectedDeparture - c.departure).toBe(d.delay * 1000)

  const pattern = patterns[t.pattern]
  const stop: LatLon = [platforms[pattern.stops[k]].lat, platforms[pattern.stops[k]].lon]
  // The path from two stops before to one stop after, each point tagged before/after the stop.
  const path: { p: LatLon; before: boolean; seg: number }[] = []
  for (const s of [k - 2, k - 1, k]) {
    if (s < 0 || s >= pattern.segments.length) continue
    for (const p of decode(segments[pattern.segments[s]])) path.push({ p, before: s < k, seg: s })
  }

  const tryAt = async (centre: LatLon, label: string) => {
    await page.goto(`/en?map=16.00/${centre[0].toFixed(5)}/${centre[1].toFixed(5)}`)
    await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.waitForTimeout(800)
    await step(`paused centred on ${label}`)
    const box = (await page.getByRole('region', { name: 'Live map of Copenhagen' }).boundingBox())!
    const [cx, cy] = project(centre, 16)
    // Sample the path every 3 px.
    const pts: { x: number; y: number; before: boolean; seg: number }[] = []
    for (let i = 0; i + 1 < path.length; i++) {
      const [ax, ay] = project(path[i].p, 16), [bx, by] = project(path[i + 1].p, 16)
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3))
      for (let j = 0; j < n; j++) {
        const x = box.x + box.width / 2 + ax + ((bx - ax) * j) / n - cx
        const y = box.y + box.height / 2 + ay + ((by - ay) * j) / n - cy
        if (x > box.x + 10 && x < box.x + box.width - 10 && y > box.y + 70 && y < box.y + box.height - 10)
          pts.push({ x, y, before: path[i].before, seg: path[i].seg })
      }
    }
    const hits: typeof pts = []
    for (const pt of pts) {
      await page.mouse.move(pt.x, pt.y)
      const tip = page.getByRole('tooltip')
      try {
        await expect(tip).toContainText('Estimated from schedule', { timeout: 120 })
        const text = await tip.textContent()
        if (text?.includes(`Bus ${t.line} to ${t.headsign}`)) hits.push(pt)
      } catch {}
    }
    // Clusters of hits 12 px apart are distinct dots; tap each to read its trip key.
    const clusters: (typeof pts)[] = []
    for (const h of hits) {
      const last = clusters.at(-1)?.at(-1)
      if (last && Math.hypot(last.x - h.x, last.y - h.y) < 12) clusters.at(-1)!.push(h)
      else clusters.push([h])
    }
    console.log('clusters', clusters.length, JSON.stringify(clusters.map((c) => c[Math.floor(c.length / 2)])))
    for (const cl of clusters) {
      const pt = cl[Math.floor(cl.length / 2)]
      await page.mouse.move(pt.x, pt.y)
      await expect(page.getByRole('tooltip')).toContainText(`Bus ${t.line} to ${t.headsign}`, { timeout: 1000 })
      const text = await page.getByRole('tooltip').textContent()
      await step(`hover ${t.line} dot`)
      await page.mouse.click(pt.x, pt.y)
      await page.waitForTimeout(600)
      const url = new URL(page.url())
      console.log('tapped', url.searchParams.get('trip'))
      if (url.searchParams.get('trip') === t.key) {
        await step(`tapped ${t.line} panel open`)
        return { pt, text }
      }
      await page.goto(`/en?map=16.00/${centre[0].toFixed(5)}/${centre[1].toFixed(5)}`)
      await expect(page.locator('[data-vehicles]')).not.toHaveAttribute('data-vehicles', '0')
      await page.getByRole('button', { name: 'Pause' }).click()
      await page.waitForTimeout(800)
    }
    return undefined
  }

  let found = await tryAt(stop, `stop ${c.name}`)
  if (!found) {
    const prev = platforms[pattern.stops[k - 1]]
    found = await tryAt([prev.lat, prev.lon], `previous stop ${prev.name}`)
  }
  expect(found, `the ${t.line} dot along its path near ${c.name}`).toBeTruthy()
  console.log('found', JSON.stringify(found))
  expect(found!.text).toContain('Estimated from schedule')
  // Short of the stop, on the segment that arrives at it or earlier, not beyond.
  expect(found!.pt.before, 'the dot is on its path before the stop, not beyond it').toBe(true)
  // Zoomed screenshot of the dot itself, taken at the hover step: re-open paused and crop.
  await page.goto(`/en?map=16.00/${stop[0].toFixed(5)}/${stop[1].toFixed(5)}`)
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `.verify/branch-217-r1/map-delays-late/dot-closeup.png`, clip: { x: found!.pt.x - 60, y: found!.pt.y - 60, width: 120, height: 120 } })
}
