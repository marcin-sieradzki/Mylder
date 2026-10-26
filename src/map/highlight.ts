// The map's highlight (docs/screens.md, "The highlight chip"): one thing in focus at a time, such
// as a trip's whole line from vehicle detail or a disruption's stretch and stops from Show on
// map. Whoever raises it says what to draw and what the chip calls it; the canvas draws it over
// the dimmed lines and fits the camera to it (BaseMap.tsx), and the highlight chip reads it, so
// neither knows who raised it. It lasts until it is cleared or another takes its place, through a
// panel closing, but not through a reload.
import 'client-only'
import { useSyncExternalStore } from 'react'
import type { LatLon } from '../domain/trip-motion.ts'
import type { Mode } from '../timetable/format.ts'
import type { Network } from '../timetable/network.ts'

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
      point: [platforms[index].lat, platforms[index].lon],
      colour: line.colour,
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

/** Perron's breakpoint.phone. */
const PHONE = 760

/** The room a fit keeps for the highlight itself, across and down, before it pads less. */
const ROOM = 200

/** The margin a fit keeps beyond whatever floats over the map. */
const MARGIN = 24

/**
 * How far a fit keeps from the edges of a map `width` by `height`, clear of what floats over it,
 * from Perron's sizes: on a desktop the top bar and the highlight chip under it, the sheet at the
 * left and the detail panel at the right; on a phone the top bar's two rows, the chip and the
 * bottom sheet's peek. A window too small for that pads less, so the highlight keeps room.
 */
export function fitPadding(width: number, height: number): Padding {
  const gap = 12 // size.panel-gap, and space.300 from the edge
  const chip = 34 + 8 // size.control, and its gap under the top bar (MapHighlight.module.css)
  const padding: Padding =
    width > PHONE
      ? {
          top: gap + 68 + chip + MARGIN, // the top bar's glass group
          right: 364 + gap + MARGIN, // size.detail-width
          bottom: 2 * MARGIN,
          left: 376 + gap + MARGIN, // size.sheet-width
        }
      : {
          top: gap + 114 + chip + MARGIN, // the top bar's group, its filters on a second row
          right: MARGIN,
          bottom: 182 + gap + MARGIN, // size.sheet-peek
          left: MARGIN,
        }
  const across = Math.min(1, Math.max(0, width - ROOM) / (padding.left + padding.right))
  const down = Math.min(1, Math.max(0, height - ROOM) / (padding.top + padding.bottom))
  return {
    top: Math.floor(padding.top * down),
    right: Math.floor(padding.right * across),
    bottom: Math.floor(padding.bottom * down),
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
