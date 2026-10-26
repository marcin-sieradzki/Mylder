// An aircraft's glyph, as Perron's Map page draws it (docs/aircraft.md, "The browser"): the
// outline of Perron's `aircraft` icon, turned about its centre to the aircraft's track, in
// `color.map.aircraft`, in a box of `map.aircraft-size.air` in the air and
// `map.aircraft-size.ground` on the ground. Its data state is the vehicle dots' shape as far as a
// plane can take it: Live filled, Ageing filled at the dots' ageing strength with a rim, Estimated
// hollow, No signal grey and cut; the rims are drawn inside the outline, so the box is the same in
// every state. The halo is the dots'. The outline is read from Perron's icon file, never copied,
// and the sizes and colours from Perron's tokens, read once per theme change (paint.ts).
import 'client-only'
import icon from '@mylder/perron/icons/aircraft.svg'
import type { AircraftState } from '../domain/aircraft-state.ts'
import type { SnapshotAircraft } from '../tracker/aircraft/index.ts'
import { urlOf, type Asset } from './asset.ts'
import { lookOf, parseColour, vehicleTokens, withAlpha, type RGBA } from './glyphs.ts'
import { numberOf, type Paint } from './paint.ts'

const COLOUR = 'perron-color-map-aircraft'
const SIZE = 'perron-map-aircraft-size'
const RIM = 'perron-map-aircraft-stroke-width'

/** Every token an aircraft's glyph reads, for `readPaint`. */
export const aircraftTokens = (): string[] => [
  ...vehicleTokens(),
  COLOUR,
  `${SIZE}-air`,
  `${SIZE}-ground`,
  `${RIM}-ageing`,
  `${RIM}-estimated`,
]

/** The aircraft glyphs' outline, sizes and colours under one theme, in px. */
export interface AircraftLook {
  /** The outline of Perron's `aircraft` icon, an SVG path on its 14 px grid, pointing north. */
  readonly outline: string
  readonly colour: RGBA
  /** The glyph's box, in the air and on the ground. */
  readonly size: { readonly air: number; readonly ground: number }
  /** The vehicle dots' halo: the outline stroked this wide on each side, under the glyph. */
  readonly halo: { readonly width: number; readonly colour: RGBA }
  readonly ageing: { readonly fillOpacity: number; readonly rim: number }
  readonly estimated: { readonly rim: number }
  readonly noSignal: { readonly cut: number; readonly grey: RGBA }
}

const INK: RGBA = [0, 0, 0, 255]

/** The look the paint read now gives the outline. */
export function aircraftLookOf(paint: Paint, outline: string): AircraftLook {
  const dots = lookOf(paint)
  return {
    outline,
    colour: parseColour(paint.get(COLOUR) ?? '') ?? INK,
    size: { air: numberOf(paint, `${SIZE}-air`), ground: numberOf(paint, `${SIZE}-ground`) },
    halo: dots.halo,
    ageing: { fillOpacity: dots.ageing.fillOpacity, rim: numberOf(paint, `${RIM}-ageing`) },
    estimated: { rim: numberOf(paint, `${RIM}-estimated`) },
    noSignal: dots.noSignal,
  }
}

/** One aircraft as the canvas draws it, in px. */
export interface AircraftGlyph {
  /** The side of the glyph's box, the same in every state. */
  readonly size: number
  readonly fill: RGBA
  /** The rim's colour, and its width inside the outline: 0 for none. */
  readonly line: RGBA
  readonly rim: number
  /** The width of the No signal cut, a gap from the box's top left to its bottom right; 0 for none. */
  readonly cut: number
  /** Its turn from north in degrees, anticlockwise as deck.gl turns an icon. */
  readonly angle: number
}

/** The glyph of `aircraft` in `state`. */
export function aircraftGlyphOf(
  state: AircraftState,
  aircraft: Pick<SnapshotAircraft, 'altitude' | 'track'>,
  look: AircraftLook,
): AircraftGlyph {
  const { colour } = look
  const shape = {
    size: aircraft.altitude === 'ground' ? look.size.ground : look.size.air,
    // A track runs clockwise from north; deck.gl turns an icon the other way.
    angle: -(aircraft.track ?? 0),
  }
  const none = withAlpha(colour, 0)
  switch (state) {
    case 'live':
      return { ...shape, fill: colour, line: none, rim: 0, cut: 0 }
    case 'ageing':
      return {
        ...shape,
        fill: withAlpha(colour, look.ageing.fillOpacity * 255),
        line: colour,
        rim: look.ageing.rim,
        cut: 0,
      }
    case 'estimated':
      return { ...shape, fill: none, line: colour, rim: look.estimated.rim, cut: 0 }
    case 'no-signal': {
      const { grey, cut } = look.noSignal
      return { ...shape, fill: grey, line: withAlpha(grey, 0), rim: 0, cut }
    }
  }
}

const PATH = /<path\b[^>]*\sd=(?:"([^"]+)"|'([^']+)')/

/** The outline in an icon file's text: its path's `d`; none when it has no path. */
export function outlineOf(svg: string): string | undefined {
  const found = PATH.exec(svg)
  return found ? (found[1] ?? found[2]) : undefined
}

let loading: Promise<string> | undefined

/**
 * Perron's aircraft outline, read once from its icon file as the build serves it. A load that
 * fails is tried again on the next call.
 */
export function aircraftOutline(): Promise<string> {
  loading ??= (async () => {
    const response = await fetch(urlOf(icon as Asset))
    if (!response.ok) throw new Error(`Perron's aircraft icon answered ${response.status}`)
    const outline = outlineOf(await response.text())
    if (outline === undefined) throw new Error("Perron's aircraft icon has no outline")
    return outline
  })().catch((error: unknown) => {
    loading = undefined
    throw error
  })
  return loading
}
