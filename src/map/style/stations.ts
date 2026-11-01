// A station drawn as a rounded bar across every line through it, as a transit map draws one:
// laid across the lines where they meet the station's platforms, long enough to take in each
// line's strand there, and turned with the map. The lines lie a fixed number of px apart on their
// strands, but their tracks lie metres apart, which the map draws further apart the closer it is,
// so a bar's length is worked out for each band of zoom. A station whose lines run apart, such as
// København H's Metro under the street beside its trains, gets a bar for each.
import type { Mode } from '../../timetable/format.ts'
import type { Network } from '../../timetable/network.ts'
import type { LatLon } from '../../timetable/polyline.ts'

/** One bar across the lines at a station. */
export interface StationBar {
  /** The stop's index in the network's stops. */
  readonly stop: number
  /** Where it is drawn: the middle of the points where its lines meet the stop. */
  readonly at: LatLon
  /** The way its lines run there, in degrees clockwise from north; the bar lies across it. */
  readonly bearing: number
  /** The band of zoom it is drawn in, an index in BAR_BANDS. */
  readonly band: number
  /** Its length across the lines, in px, to the nearest px. */
  readonly length: number
  /** How far its middle sits from `at`, in px, to the right of `bearing`. */
  readonly offset: number
}

/** The bands of zoom a bar is drawn in, each with its own length; none further out than 13. */
export const BAR_BANDS: readonly { readonly from: number; readonly to: number }[] = [
  { from: 13, to: 14 },
  { from: 14, to: 15 },
  { from: 15, to: 16 },
  { from: 16, to: 17 },
  { from: 17, to: 24 },
]

/** Metres to a px at a zoom, at Copenhagen's latitude, on MapLibre's 512 px tiles. */
const metresPerPx = (zoom: number) => (40_075_016.686 * COS_LAT) / (512 * 2 ** zoom)

/** A rail line's width in px and a pattern's offset on each of its steps, as the style draws them. */
export interface Drawn {
  readonly widthOf: (mode: Mode) => number
  readonly offsets: readonly (Float32Array | undefined)[]
}

/** How far apart two lines may meet a stop and still share a bar: one station's tracks. */
const SAME_BAR_METRES = 120
/** How far two lines' ways at a stop may turn from each other and still share a bar. */
const SAME_BAR_DEGREES = 30
/** How far along a path its way at a stop is read, past the shape's last turns into the stop. */
const WAY_METRES = 60
/** A segment of two points longer than this is one without a shape, joining two stops straight. */
const UNSHAPED = 2_000
/** The bar's reach past the outermost lines, in px, at each end. */
const OVERHANG = 3

/** The groups of rail modes that share a bar: the Metro and the light rail run apart from trains. */
const groupOf = (mode: Mode) => (mode === 'metro' || mode === 'light-rail' ? mode : 'rail')

interface Meeting {
  readonly x: number
  readonly y: number
  /** The way the pattern runs there, a unit vector east and north. */
  readonly way: readonly [number, number]
  /** Its strand's offset, in px to the right of the way it runs. */
  readonly offset: number
  readonly width: number
}

/** The bars across the lines at each station, from the rail patterns and their offsets. */
export function stationBars(network: Network, drawn: Drawn): StationBar[] {
  const { lines, patterns } = network.patterns
  const stopOf = (platform: number) => network.stops.platforms[platform].stop
  const meetings = new Map<string, { stop: number; list: Meeting[] }>()
  patterns.forEach((pattern, index) => {
    const offsets = drawn.offsets[index]
    const mode = lines[pattern.line].mode
    if (!offsets || mode === 'bus') return
    const width = drawn.widthOf(mode)
    pattern.stops.forEach((platform, i) => {
      const into = i > 0 ? network.paths.points(pattern.segments[i - 1]) : undefined
      const out =
        i < pattern.segments.length ? network.paths.points(pattern.segments[i]) : undefined
      const point = out?.[0] ?? into?.at(-1)
      if (!point) return
      const way = wayAt(point, into, out)
      if (!way) return
      const [x, y] = metres(point)
      const stop = stopOf(platform)
      const key = `${stop}|${groupOf(mode)}`
      let found = meetings.get(key)
      if (!found) meetings.set(key, (found = { stop, list: [] }))
      found.list.push({ x, y, way, offset: offsets[Math.min(i, offsets.length - 1)], width })
    })
  })

  const bars: StationBar[] = []
  for (const { stop, list } of meetings.values()) {
    for (const group of near(list)) bars.push(...barsOf(stop, group))
  }
  return bars.sort(
    (a, b) => a.band - b.band || a.stop - b.stop || a.at[0] - b.at[0] || a.at[1] - b.at[1],
  )
}

/**
 * The meetings in groups, each meeting with the first group whose first meeting is within
 * SAME_BAR_METRES and runs within SAME_BAR_DEGREES of its way, either way along it.
 */
function near(list: readonly Meeting[]): Meeting[][] {
  const groups: Meeting[][] = []
  const turn = Math.cos((SAME_BAR_DEGREES * Math.PI) / 180)
  for (const meeting of list) {
    const group = groups.find(
      ([first]) =>
        Math.hypot(first.x - meeting.x, first.y - meeting.y) <= SAME_BAR_METRES &&
        Math.abs(first.way[0] * meeting.way[0] + first.way[1] * meeting.way[1]) >= turn,
    )
    if (group) group.push(meeting)
    else groups.push([meeting])
  }
  return groups
}

function barsOf(stop: number, group: readonly Meeting[]): StationBar[] {
  // The lines' way as an axis, so two ways that run opposite each other agree: their angles
  // doubled and averaged, then halved.
  let c = 0
  let s = 0
  for (const { way } of group) {
    const angle = Math.atan2(way[0], way[1])
    c += Math.cos(2 * angle)
    s += Math.sin(2 * angle)
  }
  const axis = Math.atan2(s, c) / 2
  const along: [number, number] = [Math.sin(axis), Math.cos(axis)]
  const right: [number, number] = [along[1], -along[0]]
  const x = group.reduce((sum, m) => sum + m.x, 0) / group.length
  const y = group.reduce((sum, m) => sum + m.y, 0) / group.length
  const bearing = Math.round((((((axis * 180) / Math.PI) % 180) + 180) % 180) * 10) / 10
  return BAR_BANDS.map(({ from }, band) => {
    const perPx = metresPerPx(from + 0.5)
    let low = Infinity
    let high = -Infinity
    for (const meeting of group) {
      // A pattern running against the axis has its right on the axis's left; its track lies
      // its distance across the axis from the bar's middle.
      const side = meeting.way[0] * along[0] + meeting.way[1] * along[1] >= 0 ? 1 : -1
      const across = ((meeting.x - x) * right[0] + (meeting.y - y) * right[1]) / perPx
      const place = across + side * meeting.offset
      low = Math.min(low, place - meeting.width / 2)
      high = Math.max(high, place + meeting.width / 2)
    }
    return {
      stop,
      at: latLonOf(x, y),
      bearing,
      band,
      length: Math.round(high - low + 2 * OVERHANG),
      offset: Math.round(((low + high) / 2) * 10) / 10 || 0,
    }
  })
}

/**
 * The way a path runs at a stop, as a unit vector east and north: towards the point WAY_METRES on
 * along the path out of it, the way the strand offset there is taken, or else from the point
 * WAY_METRES back along the path into it. A train that turns back at a terminus runs out the way
 * it came in, so the two are never averaged. A segment without a shape, two points far apart,
 * says nothing of the track's way, so it is left out.
 */
function wayAt(
  point: LatLon,
  into: readonly LatLon[] | undefined,
  out: readonly LatLon[] | undefined,
): [number, number] | undefined {
  const shaped = (path: readonly LatLon[] | undefined): path is readonly LatLon[] =>
    path !== undefined && path.length > 1 && !(path.length === 2 && lengthOf(path) > UNSHAPED)
  const [px, py] = metres(point)
  let dx = 0
  let dy = 0
  if (shaped(out)) {
    const [x, y] = alongPath(out, WAY_METRES)
    ;[dx, dy] = [x - px, y - py]
  } else if (shaped(into)) {
    const [x, y] = alongPath([...into].reverse(), WAY_METRES)
    ;[dx, dy] = [px - x, py - y]
  }
  const length = Math.hypot(dx, dy)
  return length === 0 ? undefined : [dx / length, dy / length]
}

/** The point `distance` metres along a path from its first point, or its last if it is shorter. */
function alongPath(path: readonly LatLon[], distance: number): [number, number] {
  let left = distance
  let [x, y] = metres(path[0])
  for (const next of path.slice(1)) {
    const [nx, ny] = metres(next)
    const step = Math.hypot(nx - x, ny - y)
    if (step >= left) return [x + ((nx - x) * left) / step, y + ((ny - y) * left) / step]
    left -= step
    ;[x, y] = [nx, ny]
  }
  return [x, y]
}

const lengthOf = (path: readonly LatLon[]) => {
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [metres(path[i - 1]), metres(path[i])]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return total
}

// Metres east and north on a plane around Copenhagen's latitude: true to a fraction of a percent
// over a station.
const RAD = Math.PI / 180
const EARTH = 6_371_008.8
const COS_LAT = Math.cos(55.68 * RAD)
const metres = ([lat, lon]: LatLon): [number, number] => [
  lon * RAD * EARTH * COS_LAT,
  lat * RAD * EARTH,
]
const latLonOf = (x: number, y: number): LatLon => [
  Math.round((y / RAD / EARTH) * 1e6) / 1e6,
  Math.round((x / RAD / EARTH / COS_LAT) * 1e6) / 1e6,
]

/** The bar's thickness and its ring's width, in px. */
export const BAR_THICKNESS = 9
const RING = 2

const IMAGE = /^mylder-station-(\d+)-([\da-f]{6})-([\da-f]{6})$/i

/** The name of the bar image `length` px long in a fill and ring colour, each `#rrggbb`. */
export const barImageName = (length: number, fill: string, ring: string) =>
  `mylder-station-${length}-${fill.slice(1)}-${ring.slice(1)}`

/**
 * A bar's picture for its name, at `pixelRatio` device pixels to a px: a rounded bar lying east
 * and west, filled and ringed, its edges smoothed, as MapLibre's `addImage` takes it. None for a
 * name that isn't a bar's.
 */
export function barImage(
  name: string,
  pixelRatio: number,
): { width: number; height: number; data: Uint8Array } | undefined {
  const match = IMAGE.exec(name)
  if (!match) return undefined
  const [fill, ring] = [rgb(match[2]), rgb(match[3])]
  const scale = Math.max(1, Math.round(pixelRatio))
  const length = Math.max(Number(match[1]), BAR_THICKNESS)
  const width = Math.ceil(length * scale)
  const height = Math.ceil(BAR_THICKNESS * scale)
  const radius = (BAR_THICKNESS * scale) / 2
  const ringWidth = RING * scale
  const data = new Uint8Array(width * height * 4)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      // How far the pixel's middle is outside the bar's edge, in device pixels.
      const x = Math.min(Math.max(column + 0.5, radius), width - radius)
      const edge = Math.hypot(column + 0.5 - x, row + 0.5 - height / 2) - radius
      const alpha = clamp(0.5 - edge)
      if (alpha === 0) continue
      const inner = clamp(0.5 - (edge + ringWidth))
      const at = (row * width + column) * 4
      for (let channel = 0; channel < 3; channel++) {
        data[at + channel] = Math.round(fill[channel] * inner + ring[channel] * (1 - inner))
      }
      data[at + 3] = Math.round(alpha * 255)
    }
  }
  return { width, height, data }
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(0, 2), 16),
  parseInt(hex.slice(2, 4), 16),
  parseInt(hex.slice(4, 6), 16),
]
