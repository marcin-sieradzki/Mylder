// Simulated vehicles moving along the design prototype's snapped line paths (data/routes.json).
// Everything here is CPU work done once per frame: advance each vehicle along its path and
// write its lon/lat into one typed array that deck.gl uploads as-is.
import type { Mode } from './perron'

export const STATES = ['Live', 'Ageing', 'Estimated', 'Timetable only', 'No signal'] as const
export type StateIndex = 0 | 1 | 2 | 3 | 4
/** Shares of the five states, in STATES order. */
export const STATE_SHARES = [0.3, 0.1, 0.35, 0.2, 0.05]

// routes.json is in the design prototype's local metres around Nørreport.
const LON0 = 12.565
const LAT0 = 55.68
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180)
const KY = 110574

export interface RawLine {
  pts: [number, number][]
  stops: number[]
  len: number
  names: string[]
  mode: string
}

export interface Line {
  id: string
  mode: Mode
  /** lon, lat per point */
  lonlat: Float64Array
  /** cumulative distance in metres per point */
  cum: Float64Array
  len: number
  loop: boolean
  n: number
}

export function buildLines(raw: { lines: Record<string, RawLine> }): Line[] {
  return Object.entries(raw.lines).map(([id, l]) => {
    const n = l.pts.length
    const lonlat = new Float64Array(n * 2)
    const cum = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const [x, y] = l.pts[i]
      lonlat[i * 2] = x / KX + LON0
      lonlat[i * 2 + 1] = LAT0 - y / KY
      if (i > 0) {
        const [px, py] = l.pts[i - 1]
        cum[i] = cum[i - 1] + Math.hypot(x - px, y - py)
      }
    }
    const [fx, fy] = l.pts[0]
    const [lx, ly] = l.pts[n - 1]
    return {
      id,
      mode: l.mode as Mode,
      lonlat,
      cum,
      len: cum[n - 1],
      loop: Math.hypot(fx - lx, fy - ly) < 80,
      n,
    }
  })
}

export interface Sim {
  n: number
  line: Uint16Array
  dir: Int8Array
  s: Float64Array
  seg: Uint32Array
  speed: Float32Array
  state: Uint8Array
  /** lon, lat, 0 per vehicle: what deck.gl draws */
  positions: Float64Array
  /** indices of the Live vehicles, for the trail variant */
  liveIndex: Uint32Array
  liveCount: number
  /** TAIL_POINTS samples along the path behind each live vehicle, lon, lat, 0 each, oldest first */
  tailPath: Float64Array
  /** PathLayer start indices: live vehicle k's trail starts at vertex k * TAIL_POINTS */
  tailStart: Uint32Array
  tailLength: number
}

/** Points per trail. Enough to follow a street corner at 140 m. */
export const TAIL_POINTS = 5

// Vehicles per km of line, by mode: buses are dense, regional trains sparse.
const DENSITY: Record<Mode, number> = { bus: 1.6, metro: 1.2, stog: 0.9, regional: 0.35 }
// Average speed in m/s, by mode.
const SPEED: Record<Mode, number> = { bus: 6.5, metro: 11, stog: 13, regional: 22 }

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createSim(lines: Line[], n: number, seed = 7): Sim {
  const rnd = mulberry32(seed)
  // Spread vehicles over lines by length and mode density.
  const weights = lines.map((l) => (l.len / 1000) * DENSITY[l.mode])
  const total = weights.reduce((a, b) => a + b, 0)
  const counts = weights.map((w) => Math.max(2, Math.round((n * w) / total)))
  let diff = n - counts.reduce((a, b) => a + b, 0)
  for (let i = 0; diff !== 0; i = (i + 1) % counts.length) {
    if (diff > 0) {
      counts[i]++
      diff--
    } else if (counts[i] > 2) {
      counts[i]--
      diff++
    }
  }

  const sim: Sim = {
    n,
    line: new Uint16Array(n),
    dir: new Int8Array(n),
    s: new Float64Array(n),
    seg: new Uint32Array(n),
    speed: new Float32Array(n),
    state: new Uint8Array(n),
    positions: new Float64Array(n * 3),
    liveIndex: new Uint32Array(n),
    liveCount: 0,
    tailPath: new Float64Array(n * TAIL_POINTS * 3),
    tailStart: new Uint32Array(n + 1),
    tailLength: 140,
  }
  for (let i = 0; i <= n; i++) sim.tailStart[i] = i * TAIL_POINTS

  let k = 0
  lines.forEach((l, li) => {
    const c = counts[li]
    const perDir = Math.max(1, Math.floor(c / 2))
    for (let j = 0; j < c; j++) {
      const dir = j < perDir ? 1 : -1
      const slot = j < perDir ? j : j - perDir
      const slots = j < perDir ? perDir : c - perDir
      sim.line[k] = li
      sim.dir[k] = dir
      sim.s[k] = (((slot + rnd() * 0.6) / slots) * l.len) % l.len
      sim.speed[k] = SPEED[l.mode] * (0.85 + rnd() * 0.3)
      k++
    }
  })

  // Exact state shares, shuffled.
  const states: number[] = []
  STATE_SHARES.forEach((share, si) => {
    for (let i = 0; i < Math.floor(share * n); i++) states.push(si)
  })
  while (states.length < n) states.push(2)
  for (let i = states.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[states[i], states[j]] = [states[j], states[i]]
  }
  sim.state.set(states)
  let live = 0
  for (let i = 0; i < n; i++) if (sim.state[i] === 0) sim.liveIndex[live++] = i
  sim.liveCount = live

  step(sim, lines, 0, true)
  return sim
}

/** Binary search: the segment that holds distance s along the line. */
function segmentAt(line: Line, s: number): number {
  let lo = 0
  let hi = line.n - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (line.cum[mid] <= s) lo = mid
    else hi = mid - 1
  }
  return lo
}

function writePoint(out: Float64Array, o: number, line: Line, seg: number, s: number) {
  const a = line.cum[seg]
  const b = line.cum[seg + 1]
  const t = b > a ? (s - a) / (b - a) : 0
  const i = seg * 2
  out[o] = line.lonlat[i] + (line.lonlat[i + 2] - line.lonlat[i]) * t
  out[o + 1] = line.lonlat[i + 1] + (line.lonlat[i + 3] - line.lonlat[i + 1]) * t
  out[o + 2] = 0
}

/** Advance every vehicle by dt seconds and rewrite the position arrays. */
export function step(sim: Sim, lines: Line[], dt: number, tails: boolean): void {
  const { n, line, dir, s, seg, speed, positions } = sim
  for (let i = 0; i < n; i++) {
    const l = lines[line[i]]
    let p = s[i] + dir[i] * speed[i] * dt
    if (l.loop) {
      p = ((p % l.len) + l.len) % l.len
    } else if (p > l.len) {
      p = 2 * l.len - p
      dir[i] = -1
    } else if (p < 0) {
      p = -p
      dir[i] = 1
    }
    s[i] = p
    // Walk the segment index: a vehicle moves a few metres per frame, so this beats a search.
    let g = seg[i]
    const cum = l.cum
    const last = l.n - 2
    while (g < last && cum[g + 1] < p) g++
    while (g > 0 && cum[g] > p) g--
    seg[i] = g
    writePoint(positions, i * 3, l, g, p)
  }
  if (!tails) return
  const { liveIndex, liveCount, tailPath, tailLength } = sim
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndex[k]
    const l = lines[line[i]]
    const base = k * TAIL_POINTS * 3
    for (let j = 0; j < TAIL_POINTS - 1; j++) {
      let back = s[i] - dir[i] * tailLength * (1 - j / (TAIL_POINTS - 1))
      if (l.loop) back = ((back % l.len) + l.len) % l.len
      else back = Math.min(l.len, Math.max(0, back))
      writePoint(tailPath, base + j * 3, l, segmentAt(l, back), back)
    }
    const o = base + (TAIL_POINTS - 1) * 3
    tailPath[o] = positions[i * 3]
    tailPath[o + 1] = positions[i * 3 + 1]
    tailPath[o + 2] = 0
  }
}
