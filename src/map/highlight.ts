// The map's highlight (docs/screens.md, "The highlight chip"): one thing in focus at a time, such
// as a trip's whole line from vehicle detail or a disruption's stretch and stops from Show on
// map. Whoever raises it says what to draw and what the chip calls it; the canvas draws it over
// the dimmed lines and fits the camera to it (BaseMap.tsx), and the highlight chip reads it, so
// neither knows who raised it. It lasts until it is cleared or another takes its place, through a
// panel closing, but not through a reload.
import 'client-only'
import { useSyncExternalStore } from 'react'
import type { LatLon } from '../domain/trip-motion.ts'
import type { Mode, StopRecord } from '../timetable/format.ts'
import type { Network } from '../timetable/network.ts'
import type { Disruption } from '../tracker/index.ts'

/** What the chip calls the highlight: a line by its name, or words of the raiser's own. */
export type HighlightLabel =
  | { readonly kind: 'line'; readonly line: string }
  /** Words to show as they are, such as a disruption's heading, which is Rejseplanen's own. */
  | { readonly kind: 'text'; readonly text: string }

/** A stretch of track or road drawn in focus. */
export interface HighlightLine {
  /** The stretch's points, as latitude and longitude, in order. */
  readonly points: readonly LatLon[]
  /** The mode it is drawn at the width of. */
  readonly mode: Mode
  /** The Perron colour token it is drawn in, such as `perron-color-transit-line-m1`. */
  readonly colour: string
}

/** A stop ringed in focus. */
export interface HighlightStop {
  /** The stop's id, so a tap on its ring opens its departures; none for a point that is no stop. */
  readonly id?: string
  readonly point: LatLon
  /** The Perron colour token of its ring, such as a line's or a disruption's severity's. */
  readonly colour: string
}

/** What is highlighted: the lines and stops the map draws in focus, and the chip's name for it. */
export interface Highlight {
  readonly label: HighlightLabel
  readonly lines: readonly HighlightLine[]
  readonly stops: readonly HighlightStop[]
}

/** A trip's whole line: its pattern's path and stops, in its line's colour, named by its line. */
export function patternHighlight(network: Network, pattern: number): Highlight {
  const record = network.patterns.patterns[pattern]
  const line = network.patterns.lines[record.line]
  const { platforms } = network.stops
  return {
    label: { kind: 'line', line: line.name },
    lines: [{ points: network.pathOf(pattern).points, mode: line.mode, colour: line.colour }],
    stops: record.stops.map((index) => ({
      id: network.stops.stops[platforms[index].stop].id,
      point: [platforms[index].lat, platforms[index].lon],
      colour: line.colour,
    })),
  }
}

/** A disruption's kind as the SeverityLabel names it, which gives its colour on the map. */
export type Severity = 'delay' | 'data' | 'diversion' | 'planned' | 'notice'

/** The Perron colour token a severity is drawn in. */
const severityColour = (severity: Severity) => `perron-color-transit-severity-${severity}`

/** The stops a disruption's message names that the timetable knows, each once, in its order. */
export function disruptionStops(network: Network, { message }: Disruption): StopRecord[] {
  const named = [
    ...(message.affectedStops?.StopLocation ?? []),
    ...(message.validFromStop ? [message.validFromStop] : []),
    ...(message.validToStop ? [message.validToStop] : []),
  ]
  const known = new Set<StopRecord>()
  for (const { extId } of named) {
    const stop = network.stops.stopForPlatform(extId)
    if (stop) known.add(stop)
  }
  return [...known]
}

/**
 * The stretch between two stops along a pattern's calls: from the call at one to the nearest call
 * at the other, so a pattern that calls a stop twice takes the short way. None when the pattern
 * misses either.
 */
function stretchOf(calls: readonly StopRecord[], from: StopRecord, to: StopRecord) {
  let best: [number, number] | undefined
  calls.forEach((stop, a) => {
    if (stop !== from) return
    calls.forEach((other, b) => {
      if (other !== to) return
      if (!best || Math.abs(b - a) < Math.abs(best[1] - best[0])) best = [a, b]
    })
  })
  return best && [Math.min(...best), Math.max(...best)]
}

/**
 * A disruption's stretch and stops, in its severity's colour, named by its heading: each stop it
 * names that the timetable knows, ringed, and the stretch between its two end stops along every
 * pattern that runs through both. A stretch through the same stops is drawn once, whichever way
 * its patterns run.
 */
export function disruptionHighlight(
  network: Network,
  disruption: Disruption,
  severity: Severity,
): Highlight {
  const colour = severityColour(severity)
  const { stops, platforms } = network.stops
  const { validFromStop, validToStop } = disruption.message
  const from = validFromStop && network.stops.stopForPlatform(validFromStop.extId)
  const to = validToStop && network.stops.stopForPlatform(validToStop.extId)
  const lines = new Map<string, HighlightLine>()
  if (from && to && from !== to) {
    for (const pattern of network.patterns.patterns) {
      const calls = pattern.stops.map((platform) => stops[platforms[platform].stop])
      const stretch = stretchOf(calls, from, to)
      if (!stretch) continue
      const [first, last] = stretch
      const through = calls.slice(first, last + 1).map((stop) => stop.id)
      const key = [through.join(' '), through.toReversed().join(' ')].sort()[0]
      if (lines.has(key)) continue
      lines.set(key, {
        points: pattern.segments
          .slice(first, last)
          .flatMap((segment) => network.paths.points(segment)),
        mode: network.patterns.lines[pattern.line].mode,
        colour,
      })
    }
  }
  return {
    label: { kind: 'text', text: disruption.message.head },
    lines: [...lines.values()],
    stops: disruptionStops(network, disruption).map((stop) => ({
      id: stop.id,
      point: [stop.lat, stop.lon],
      colour,
    })),
  }
}

/** How far a fit keeps from each edge of the map, in CSS pixels. */
export interface Padding {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

/** Perron's breakpoint.phone: narrower is a phone, as Perron's own CSS has it. */
const PHONE = 760

/**
 * The page as narrow as a phone, as a media query: under Perron's breakpoint.phone, as Perron's
 * own CSS asks it. A custom property can't sit in a media query, so a module's CSS that lays out
 * by it writes the same query.
 */
export const PHONE_QUERY = `(max-width: ${PHONE - 0.02}px)`

/** The room a fit keeps for the highlight itself, across and down, before it pads less. */
const ROOM = 200

/** The margin a fit keeps beyond whatever floats over the map. */
const MARGIN = 24

/** What floats over the map's top and foot, as measured on the screen, in CSS pixels. */
export interface Floating {
  /** How far down the top bar and the page notices under it reach. */
  readonly top?: number
  /** How far up the legend at the map's foot reaches, which counts on a desktop. */
  readonly bottom?: number
  /** How far up a phone's open stop sheet peeks, where it measured its own (src/map/peek.ts). */
  readonly peek?: number
}

/**
 * How far a fit keeps from the edges of a map `width` by `height`, clear of what floats over it,
 * from Perron's sizes: on a desktop the top bar and the highlight chip under it, the sheet at the
 * left and the detail panel at the right; on a phone the top bar's two rows, the chip and the
 * bottom sheet's peek, an open stop sheet's own where it measured one. Where the screen has
 * measured them, it keeps clear of the page notices that push the chip down and, on a desktop, of
 * the legend. A window too small for that pads less, at the bottom first, so the highlight keeps
 * room.
 */
export function fitPadding(width: number, height: number, floating: Floating = {}): Padding {
  const gap = 12 // size.panel-gap, and space.300 from the edge
  const chip = 34 + 8 // size.control, and its gap under the top bar (MapHighlight.module.css)
  const desktop = width >= PHONE
  // The chip sits under the notices, however many there are. On a phone the legend stands on the
  // sheet's peek at the left only, so the peek's padding is enough there.
  const below = floating.top === undefined ? 0 : floating.top + chip + MARGIN
  const above = !desktop || floating.bottom === undefined ? 0 : floating.bottom + MARGIN
  const padding: Padding = desktop
    ? {
        top: Math.max(gap + 68 + chip + MARGIN, below), // the top bar's glass group
        right: 364 + gap + MARGIN, // size.detail-width
        bottom: Math.max(2 * MARGIN, above),
        left: 376 + gap + MARGIN, // size.sheet-width
      }
    : {
        top: Math.max(gap + 114 + chip + MARGIN, below), // the top bar's group, filters below
        right: MARGIN,
        bottom: (floating.peek ?? 182) + gap + MARGIN, // size.sheet-peek
        left: MARGIN,
      }
  const across = Math.min(1, Math.max(0, width - ROOM) / (padding.left + padding.right))
  // Down, the bottom gives way first, so the chip stays clear of the highlight longest.
  const down = Math.max(0, height - ROOM)
  const top = Math.min(padding.top, down)
  return {
    top: Math.floor(top),
    right: Math.floor(padding.right * across),
    bottom: Math.floor(Math.min(padding.bottom, down - top)),
    left: Math.floor(padding.left * across),
  }
}

/** The closest a fit comes, so a lone stop shows its streets. */
const FIT_ZOOM = 15

/** A camera's place over the ground: the longitude and latitude at the map's middle, and its zoom. */
export interface Place {
  readonly centre: [number, number]
  readonly zoom: number
}

/** How the map draws the ground from a place, at its size, tilt and heading now. */
export interface Lens {
  /** Where a longitude and latitude are drawn, in px from the canvas's top left. */
  project(point: [number, number]): { x: number; y: number }
  /** The longitude and latitude of the ground drawn at a point of the canvas. */
  unproject(point: { x: number; y: number }): [number, number]
}

/** A longitude and latitude in Web Mercator's world of side 1, east and south of its corner. */
const mercator = ([lon, lat]: [number, number]): [number, number] => [
  (lon + 180) / 360,
  0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI),
]
const fromMercator = ([x, y]: [number, number]): [number, number] => [
  x * 360 - 180,
  (Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) * 360) / Math.PI - 90,
]

/** The map's camera as a lens takes it: its canvas, tilt and heading, which a fit keeps. */
export interface LensCamera {
  /** The canvas's size, in CSS pixels. */
  readonly width: number
  readonly height: number
  /** The tilt from looking straight down, in degrees. */
  readonly pitch: number
  /** The compass heading up the canvas, clockwise from north, in degrees. */
  readonly bearing: number
  /** The camera's vertical field of view, in degrees. */
  readonly fov: number
}

/**
 * How `camera` draws the ground from each place, as MapLibre's camera does with no padding:
 * MapLibre's world of 512 px at zoom 0, turned to the heading and seen through a pinhole camera
 * tilted by the pitch, as far from the canvas's middle as its field of view puts it.
 */
export function groundLens({
  width,
  height,
  pitch,
  bearing,
  fov,
}: LensCamera): (place: Place) => Lens {
  const distance = height / 2 / Math.tan((fov * Math.PI) / 360)
  const [turnCos, turnSin] = [
    Math.cos((bearing * Math.PI) / 180),
    Math.sin((bearing * Math.PI) / 180),
  ]
  const [tiltCos, tiltSin] = [Math.cos((pitch * Math.PI) / 180), Math.sin((pitch * Math.PI) / 180)]
  return ({ centre, zoom }) => {
    const size = 512 * 2 ** zoom
    const [cx, cy] = mercator(centre)
    return {
      project(point) {
        const [x, y] = mercator(point)
        const east = (x - cx) * size
        const north = (cy - y) * size
        // Turned: across the canvas to the right, and up it, on the ground; tilted, the ground
        // further up the canvas is further from the camera.
        const right = east * turnCos - north * turnSin
        const up = east * turnSin + north * turnCos
        const depth = distance + up * tiltSin
        return {
          x: width / 2 + (right * distance) / depth,
          y: height / 2 - (up * tiltCos * distance) / depth,
        }
      },
      unproject({ x, y }) {
        // Back along the ray: the ground up the canvas, then across it at that depth.
        const above = height / 2 - y
        const up = (above * distance) / (distance * tiltCos - above * tiltSin)
        const right = ((x - width / 2) * (distance + up * tiltSin)) / distance
        const east = right * turnCos + up * turnSin
        const north = up * turnCos - right * turnSin
        return fromMercator([cx + east / size, cy - north / size])
      },
    }
  }
}

/** The corners of the smallest convex shape around `points`, by Andrew's monotone chain. */
function hullOf(points: [number, number][]): [number, number][] {
  const sorted = points.toSorted(([ax, ay], [bx, by]) => ax - bx || ay - by)
  if (sorted.length < 3) return sorted
  const turn = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (from: [number, number][]) => {
    const chain: [number, number][] = []
    for (const point of from) {
      while (chain.length >= 2 && turn(chain.at(-2)!, chain.at(-1)!, point) <= 0) chain.pop()
      chain.push(point)
    }
    return chain.slice(0, -1)
  }
  const hull = [...half(sorted), ...half(sorted.toReversed())]
  return hull.length > 0 ? hull : [sorted[0]]
}

/**
 * Where the camera goes to fit `highlight` on a map `area` wide and high, clear of `padding`, at
 * the tilt and heading `lensAt` draws with, which it keeps: the place from which every line and
 * stop of it is drawn inside the padding, as close as it fits, up to zoom 15, and in the middle of
 * the room the padding leaves. Flat and north-up, that is the box around it fitted as MapLibre
 * fits it; tilted, the ground near the foot of the canvas is drawn larger than the ground far up
 * it, and turned, the box turns, so the fit measures what the lens draws, and steps there from the
 * flat fit. None when the highlight has nothing to draw.
 */
export function fitPlace(
  highlight: Highlight,
  area: { readonly width: number; readonly height: number },
  padding: Padding,
  lensAt: (place: Place) => Lens,
): Place | undefined {
  const world = [
    ...highlight.lines.flatMap((line) => line.points),
    ...highlight.stops.map((stop) => stop.point),
  ].map(([lat, lon]) => mercator([lon, lat]))
  if (world.length === 0) return undefined
  const room = {
    width: Math.max(1, area.width - padding.left - padding.right),
    height: Math.max(1, area.height - padding.top - padding.bottom),
  }
  const middle = { x: padding.left + room.width / 2, y: padding.top + room.height / 2 }
  // The camera draws the Mercator world's flat ground in perspective, which keeps the outermost
  // points outermost, so those are all the fit measures.
  const points = hullOf(world).map(fromMercator)
  // The flat, north-up fit first, in MapLibre's world of 512 px at zoom 0.
  const xs = world.map(([x]) => x)
  const ys = world.map(([, y]) => y)
  const [west, east, north, south] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ]
  const flatZoom = Math.log2(
    Math.min(room.width / (512 * (east - west)), room.height / (512 * (south - north))),
  )
  const flat: Place = {
    centre: fromMercator([(west + east) / 2, (north + south) / 2]),
    zoom: Math.min(FIT_ZOOM, flatZoom),
  }
  /**
   * The place at `zoom` from which what is drawn sits in the room's middle, stepped to from
   * `from`, and how much of the room it fills there, its larger share across or down: 1 or less
   * fits. Where the steps don't settle, nothing fits.
   */
  const centred = (from: Place, zoom: number) => {
    let place: Place = { centre: from.centre, zoom }
    for (let step = 0; step < 50; step++) {
      const lens = lensAt(place)
      let [left, right, top, bottom] = [Infinity, -Infinity, Infinity, -Infinity]
      for (const point of points) {
        const { x, y } = lens.project(point)
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
      const off = { x: (left + right) / 2 - middle.x, y: (top + bottom) / 2 - middle.y }
      if (!Number.isFinite(off.x + off.y)) break
      if (Math.hypot(off.x, off.y) < 0.05) {
        return { place, fill: Math.max((right - left) / room.width, (bottom - top) / room.height) }
      }
      place = {
        centre: lens.unproject({ x: area.width / 2 + off.x, y: area.height / 2 + off.y }),
        zoom,
      }
    }
    return { place, fill: Infinity }
  }
  const fits = (tried: { fill: number }) => tried.fill <= 1 + 1e-4
  // Then the closest zoom that fits, found by halving between one that fits and one that doesn't:
  // tilted, the ground near the foot of the canvas grows faster than the zoom does.
  let fitting = centred(flat, flat.zoom)
  let [low, high] = [flat.zoom, FIT_ZOOM]
  for (let out = 1; !fits(fitting); out++) {
    if (out > 8) return flat
    ;[low, high] = [flat.zoom - out, flat.zoom - out + 1]
    fitting = centred(fitting.place, low)
  }
  const closest = high > low ? centred(fitting.place, high) : undefined
  if (closest && fits(closest)) return closest.place
  // Flat and north-up, the flat fit already fills the room.
  while (fitting.fill < 0.999 && high - low > 1e-4) {
    const zoom = (low + high) / 2
    const tried = centred(fitting.place, zoom)
    if (fits(tried)) [fitting, low] = [tried, zoom]
    else high = zoom
  }
  return fitting.place
}

export interface HighlightStore {
  /** What is highlighted now; none while the map is normal. */
  get(): Highlight | undefined
  /** Highlights `highlight`, in place of whatever was. */
  show(highlight: Highlight): void
  /** Returns the map to normal. */
  clear(): void
  /** Calls back whenever the highlight changes; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

/** A store with nothing highlighted. */
export function highlightStore(): HighlightStore {
  let shown: Highlight | undefined
  const listeners = new Set<() => void>()
  const set = (to: Highlight | undefined) => {
    if (to === shown) return
    shown = to
    for (const listener of listeners) listener()
  }
  return {
    get: () => shown,
    show: set,
    clear: () => set(undefined),
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}

/** The page's one highlight, which the canvas draws and the chip names. */
export const mapHighlight = highlightStore()

/** What is highlighted, for a component such as the chip. */
export function useHighlight(store: HighlightStore = mapHighlight): Highlight | undefined {
  return useSyncExternalStore(store.subscribe, store.get, () => undefined)
}
