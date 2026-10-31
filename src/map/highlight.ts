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

/** A box on the map: its south-west and north-east corners, each longitude then latitude. */
export type Bounds = [[number, number], [number, number]]

/** The box that holds every line and stop of `highlight`; none when it has nothing to draw. */
export function boundsOf(highlight: Highlight): Bounds | undefined {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  const take = ([lat, lon]: LatLon) => {
    west = Math.min(west, lon)
    east = Math.max(east, lon)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  for (const line of highlight.lines) line.points.forEach(take)
  for (const stop of highlight.stops) take(stop.point)
  if (west > east) return undefined
  return [
    [west, south],
    [east, north],
  ]
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
}

/**
 * How far a fit keeps from the edges of a map `width` by `height`, clear of what floats over it,
 * from Perron's sizes: on a desktop the top bar and the highlight chip under it, the sheet at the
 * left and the detail panel at the right; on a phone the top bar's two rows, the chip and the
 * bottom sheet's peek. Where the screen has measured them, it keeps clear of the page notices
 * that push the chip down and, on a desktop, of the legend. A window too small for that pads
 * less, at the bottom first, so the highlight keeps room.
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
        bottom: 182 + gap + MARGIN, // size.sheet-peek
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
