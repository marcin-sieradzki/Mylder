// A vehicle's glyph: the shape that says its data state, as Perron's data-states page draws it
// and the map-layer prototype (#14) settled it (variant A: the line's colour fills the dot, the
// state is the shape, on a land-coloured halo). Sizes and colours come from Perron's tokens,
// read once per theme change (paint.ts), so the canvas and the legend never disagree.
import 'client-only'
import type { DataState } from '../domain/data-state.ts'
import type { Mode } from '../timetable/format.ts'
import { numberOf, type Paint } from './paint.ts'

/** A colour as deck.gl takes it: red, green, blue and alpha, 0 to 255. */
export type RGBA = readonly [number, number, number, number]

/** Perron's map dot radius for each mode, in px at the default zoom. */
const RADIUS: Record<Mode, string> = {
  bus: 'perron-map-dot-radius-bus',
  metro: 'perron-map-dot-radius-metro',
  's-tog': 'perron-map-dot-radius-stog',
  train: 'perron-map-dot-radius-regional',
  'light-rail': 'perron-map-dot-radius-regional',
}

const DOT = 'perron-vehicle-dot'
const STATE = 'perron-color-data-state'

/** Every token a glyph reads, for `readPaint`. */
export function vehicleTokens(): string[] {
  return [
    ...Object.values(RADIUS),
    `${DOT}-halo`,
    `${DOT}-ageing-fill-opacity`,
    `${DOT}-ageing-stroke-width`,
    `${DOT}-ageing-stroke-inset`,
    `${DOT}-estimated-stroke-width`,
    `${DOT}-estimated-stroke-inset`,
    `${DOT}-timetable-stroke-width`,
    `${DOT}-timetable-stroke-inset`,
    `${DOT}-timetable-dash`,
    `${DOT}-no-signal-cut-width`,
    `${STATE}-no-signal`,
    `${STATE}-outline`,
    `${STATE}-halo`,
  ]
}

/** The glyphs' sizes and colours under one theme, in px. */
export interface Look {
  readonly radius: Readonly<Record<Mode, number>>
  /** The land-coloured disc under every dot, this much wider than it. */
  readonly halo: { readonly width: number; readonly colour: RGBA }
  readonly ageing: { readonly fillOpacity: number; readonly stroke: number; readonly inset: number }
  readonly estimated: { readonly stroke: number; readonly inset: number }
  readonly timetable: {
    readonly stroke: number
    readonly inset: number
    readonly dash: readonly [number, number]
  }
  readonly noSignal: { readonly cut: number; readonly grey: RGBA }
  /** The hairline round a light colour on the light map; transparent on the dark. */
  readonly outline: RGBA
}

const TRANSPARENT: RGBA = [0, 0, 0, 0]

/** The look the paint read now gives. */
export function lookOf(paint: Paint): Look {
  const size = (name: string) => numberOf(paint, `${DOT}-${name}`)
  const colour = (name: string) => parseColour(paint.get(`${STATE}-${name}`) ?? '') ?? TRANSPARENT
  const [on = 0, off = 0] = (paint.get(`${DOT}-timetable-dash`) ?? '')
    .split(/\s+/)
    .map((part) => parseFloat(part))
  const radius = Object.fromEntries(
    Object.entries(RADIUS).map(([mode, token]) => [mode, numberOf(paint, token)]),
  ) as Record<Mode, number>
  return {
    radius,
    halo: { width: size('halo'), colour: colour('halo') },
    ageing: {
      fillOpacity: size('ageing-fill-opacity'),
      stroke: size('ageing-stroke-width'),
      inset: size('ageing-stroke-inset'),
    },
    estimated: { stroke: size('estimated-stroke-width'), inset: size('estimated-stroke-inset') },
    timetable: {
      stroke: size('timetable-stroke-width'),
      inset: size('timetable-stroke-inset'),
      dash: [on, off],
    },
    noSignal: { cut: size('no-signal-cut-width'), grey: colour('no-signal') },
    outline: colour('outline'),
  }
}

/** One vehicle as deck.gl draws it: a circle, its stroke, its dash and its cut, in px. */
export interface Glyph {
  /** deck.gl centres the stroke on the radius, so a ring's outer edge is radius + width / 2. */
  readonly radius: number
  readonly lineWidth: number
  readonly fill: RGBA
  readonly line: RGBA
  /** The dash and the gap, in stroke widths, as deck.gl's path-style extension measures them. */
  readonly dash: readonly [number, number]
  /** The width of the No signal cut, a diagonal gap through the dot; 0 for none. */
  readonly cut: number
}

const NO_DASH: readonly [number, number] = [0, 0]

const withAlpha = ([r, g, b]: RGBA, alpha: number): RGBA => [r, g, b, Math.round(alpha)]

/** The glyph of a vehicle of `mode` in `state`, in its line's `colour`. */
export const glyphOf = (state: DataState, mode: Mode, colour: RGBA, look: Look): Glyph =>
  sizedGlyph(state, look.radius[mode], colour, look)

/** The glyph of a dot of radius `r` in `state`, in `colour`: a vehicle's, or an aircraft's. */
export function sizedGlyph(state: DataState, r: number, colour: RGBA, look: Look): Glyph {
  const plain = { fill: colour, line: colour, dash: NO_DASH, cut: 0 }
  switch (state) {
    case 'live': {
      // A light colour on the light map gets a hairline, inside the dot's own size.
      const hair = look.outline[3] > 0 && luminance(colour) > 0.4
      return hair
        ? { ...plain, radius: r - 0.5, lineWidth: 1, line: look.outline }
        : { ...plain, radius: r, lineWidth: 0 }
    }
    case 'ageing':
      return {
        ...plain,
        fill: withAlpha(colour, look.ageing.fillOpacity * 255),
        radius: r - look.ageing.inset,
        lineWidth: look.ageing.stroke,
      }
    case 'estimated':
      return {
        ...plain,
        fill: withAlpha(colour, 0),
        radius: r - look.estimated.inset,
        lineWidth: look.estimated.stroke,
      }
    case 'timetable-only': {
      const { stroke, inset, dash } = look.timetable
      return {
        ...plain,
        fill: withAlpha(colour, 0),
        radius: r - inset,
        lineWidth: stroke,
        dash: [dash[0] / stroke, dash[1] / stroke],
      }
    }
    case 'no-signal': {
      const { grey, cut } = look.noSignal
      return { fill: grey, line: grey, dash: NO_DASH, radius: r, lineWidth: 0, cut }
    }
  }
}

/**
 * How much bigger than Perron's size a dot is drawn at a zoom: Perron's sizes hold at street
 * zoom, far out they shrink so the city's thousands of dots don't merge, and close in they grow.
 */
export function radiusScaleAt(zoom: number): number {
  if (zoom < 10.5) return 0.6
  if (zoom < 12) return 0.6 + ((zoom - 10.5) / 1.5) * 0.25
  if (zoom < 14) return 0.85 + ((zoom - 12) / 2) * 0.15
  if (zoom < 16) return 1 + ((zoom - 14) / 2) * 0.2
  return 1.2
}

const HEX = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i
const RGB = /^rgba?\(\s*([^)]*)\)$/i

/** A CSS colour as a token holds it, hex or rgb(), or undefined for any other form. */
export function parseColour(css: string): RGBA | undefined {
  const text = css.trim()
  const hex = HEX.exec(text)
  if (hex) {
    const digits = hex[1]
    const short = digits.length <= 4
    const channel = (i: number) =>
      short ? parseInt(digits[i] + digits[i], 16) : parseInt(digits.slice(i * 2, i * 2 + 2), 16)
    const count = short ? digits.length : digits.length / 2
    return [channel(0), channel(1), channel(2), count === 4 ? channel(3) : 255]
  }
  const rgb = RGB.exec(text)
  if (!rgb) return undefined
  const parts = rgb[1].split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3) return undefined
  const [r, g, b] = parts.map((part) => parseFloat(part))
  const alpha = parts[3]
  const a = alpha === undefined ? 1 : parseFloat(alpha) / (alpha.endsWith('%') ? 100 : 1)
  return [r, g, b, Math.round(a * 255)]
}

/** Relative luminance, 0 to 1, for the hairline rule. */
function luminance([r, g, b]: RGBA): number {
  const linear = (channel: number) => {
    const v = channel / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}
