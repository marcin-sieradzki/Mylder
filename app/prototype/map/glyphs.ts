// The three glyph treatments. Each turns the simulation's modes, lines and states into the
// typed arrays deck.gl draws: radius, stroke width, fill and stroke colour, dash and cut per
// vehicle. They are rebuilt only when the variant or the theme changes, never per frame.
import {
  dotRadius,
  lineColour,
  luminance,
  opacity,
  parseColour,
  tokens,
  vehicleDot,
  type Mode,
  type RGBA,
  type Theme,
} from './perron'
import { TAIL_POINTS, type Line, type Sim, type StateIndex } from './sim'

export type Variant = 'a' | 'b' | 'c'

export const VARIANTS: Record<Variant, { name: string; blurb: string }> = {
  a: {
    name: 'Perron glyphs',
    blurb:
      'Line colour fills the dot; the state is the shape: solid, faint with a rim, ring, dashed ring, grey with a cut. Land-coloured halo.',
  },
  b: {
    name: 'Ink core, line ring',
    blurb:
      'A thin ring in the line colour carries identity; an ink core carries the state in the same five shapes. Larger dots.',
  },
  c: {
    name: 'Bold with trails',
    blurb:
      'Perron shapes a third larger on a surface-coloured halo, and Live vehicles leave a short trail behind them.',
  },
}

export interface GlyphArrays {
  radius: Float32Array
  lineWidth: Float32Array
  fill: Uint8ClampedArray
  line: Uint8ClampedArray
  dash: Float32Array
  cut: Float32Array
}

export interface VariantLook {
  variant: Variant
  /** Under everything: a land- or surface-coloured disc. */
  halo: { radius: Float32Array; colour: RGBA }
  /** Variant B only: the identity ring outside the state glyph. */
  ring: { radius: Float32Array; colour: Uint8ClampedArray; width: number } | null
  glyph: GlyphArrays
  /** Variant C only: a trail behind each Live vehicle. */
  tails: { width: number; colour: Uint8ClampedArray } | null
  /** Legend samples: how one vehicle of each state looks, for the on-screen legend. */
  sample: { colour: string; ink: string; grey: string; halo: string }
}

function put(a: Uint8ClampedArray, i: number, c: RGBA, alpha = c[3]) {
  a[i * 4] = c[0]
  a[i * 4 + 1] = c[1]
  a[i * 4 + 2] = c[2]
  a[i * 4 + 3] = alpha
}

/**
 * Writes one vehicle's state shape, per Perron's data-states page. `colour` is the glyph's
 * own colour (line colour, or ink in variant B). deck.gl centres the stroke on the radius, so
 * a ring with inset i and width w is drawn at r - i, and its outer edge lands on r - i + w/2.
 */
function stateShape(
  g: GlyphArrays,
  i: number,
  r: number,
  colour: RGBA,
  state: StateIndex,
  theme: Theme,
  grey: RGBA,
  outline: RGBA,
) {
  g.dash[i * 2] = 0
  g.dash[i * 2 + 1] = 0
  g.cut[i] = 0
  switch (state) {
    case 0: {
      // Live: solid. A hairline for light colours on the light map (the outline token is transparent in dark).
      put(g.fill, i, colour)
      const hair = theme === 'light' && luminance(colour) > 0.4
      put(g.line, i, hair ? outline : colour)
      g.lineWidth[i] = hair ? 1 : 0
      g.radius[i] = hair ? r - 0.5 : r
      break
    }
    case 1: {
      // Ageing: fainter fill with a rim pulled in.
      put(g.fill, i, colour, Math.round(vehicleDot.ageing.fillOpacity * 255))
      put(g.line, i, colour)
      g.lineWidth[i] = vehicleDot.ageing.strokeWidth
      g.radius[i] = r - vehicleDot.ageing.strokeInset
      break
    }
    case 2: {
      // Estimated: a ring.
      put(g.fill, i, colour, 0)
      put(g.line, i, colour)
      g.lineWidth[i] = vehicleDot.estimated.strokeWidth
      g.radius[i] = r - vehicleDot.estimated.strokeInset
      break
    }
    case 3: {
      // Timetable only: a dashed ring. The dash array is in stroke widths (deck.gl 9.4 measures
      // posAlongStroke / strokeWidth), so 2.1 px on and 1.7 px off on a 1.6 px stroke is [1.31, 1.06].
      const w = vehicleDot.timetable.strokeWidth
      put(g.fill, i, colour, 0)
      put(g.line, i, colour)
      g.lineWidth[i] = w
      g.radius[i] = r - vehicleDot.timetable.strokeInset
      g.dash[i * 2] = vehicleDot.timetable.dash[0] / w
      g.dash[i * 2 + 1] = vehicleDot.timetable.dash[1] / w
      break
    }
    case 4: {
      // No signal: the grey, cut by a diagonal gap.
      put(g.fill, i, grey)
      put(g.line, i, grey)
      g.lineWidth[i] = 0
      g.radius[i] = r
      g.cut[i] = vehicleDot.noSignal.cutWidth
      break
    }
  }
}

function emptyGlyphs(n: number): GlyphArrays {
  return {
    radius: new Float32Array(n),
    lineWidth: new Float32Array(n),
    fill: new Uint8ClampedArray(n * 4),
    line: new Uint8ClampedArray(n * 4),
    dash: new Float32Array(n * 2),
    cut: new Float32Array(n),
  }
}

export function buildLook(variant: Variant, sim: Sim, lines: Line[], theme: Theme): VariantLook {
  const t = tokens(theme)
  const n = sim.n
  const grey = parseColour(t['color.data-state.no-signal'])
  const outline = parseColour(t['color.data-state.outline'])
  const land = parseColour(t['color.data-state.halo'])
  const ink = parseColour(t['color.text.primary'])
  const surface = parseColour(t['color.surface.raised'])
  const colourOf = new Map<string, RGBA>()
  const colour = (l: Line) => {
    let c = colourOf.get(l.id)
    if (!c) {
      c = parseColour(lineColour(l.id, l.mode as Mode, theme))
      colourOf.set(l.id, c)
    }
    return c
  }

  const glyph = emptyGlyphs(n)
  const haloRadius = new Float32Array(n)

  if (variant === 'a') {
    for (let i = 0; i < n; i++) {
      const l = lines[sim.line[i]]
      const r = dotRadius[l.mode]
      stateShape(glyph, i, r, colour(l), sim.state[i] as StateIndex, theme, grey, outline)
      haloRadius[i] = r + vehicleDot.halo
    }
    return {
      variant,
      halo: { radius: haloRadius, colour: land },
      ring: null,
      glyph,
      tails: null,
      sample: sampleOf(theme, land),
    }
  }

  if (variant === 'b') {
    const ringRadius = new Float32Array(n)
    const ringColour = new Uint8ClampedArray(n * 4)
    const ringWidth = 1.3
    for (let i = 0; i < n; i++) {
      const l = lines[sim.line[i]]
      const R = dotRadius[l.mode] + 1.6
      const state = sim.state[i] as StateIndex
      // The ring carries the line colour, or the No signal grey when the vehicle is silent.
      ringRadius[i] = R
      put(ringColour, i, state === 4 ? grey : colour(l))
      // The core carries the state in ink, drawn inside the ring with a gap.
      stateShape(glyph, i, R - 2.3, ink, state, theme, grey, outline)
      haloRadius[i] = R + ringWidth / 2 + vehicleDot.halo
    }
    return {
      variant,
      halo: { radius: haloRadius, colour: land },
      ring: { radius: ringRadius, colour: ringColour, width: ringWidth },
      glyph,
      tails: null,
      sample: sampleOf(theme, land),
    }
  }

  // Variant C: Perron shapes a third larger, a surface-coloured halo, trails behind Live vehicles.
  // PathLayer colours are per vertex with binary data: the trail fades in from its tail end.
  const tailColour = new Uint8ClampedArray(sim.liveCount * TAIL_POINTS * 4)
  for (let i = 0; i < n; i++) {
    const l = lines[sim.line[i]]
    const r = dotRadius[l.mode] * 1.35
    stateShape(glyph, i, r, colour(l), sim.state[i] as StateIndex, theme, grey, outline)
    haloRadius[i] = r + 2
  }
  for (let k = 0; k < sim.liveCount; k++) {
    const l = lines[sim.line[sim.liveIndex[k]]]
    for (let j = 0; j < TAIL_POINTS; j++) {
      put(
        tailColour,
        k * TAIL_POINTS + j,
        colour(l),
        Math.round((opacity.trail * 255 * j) / (TAIL_POINTS - 1)),
      )
    }
  }
  return {
    variant,
    halo: { radius: haloRadius, colour: surface },
    ring: null,
    glyph,
    tails: { width: 2.5, colour: tailColour },
    sample: sampleOf(theme, surface),
  }
}

function sampleOf(theme: Theme, halo: RGBA) {
  const t = tokens(theme)
  return {
    colour: lineColour('A', 'stog', theme),
    ink: t['color.text.primary'],
    grey: t['color.data-state.no-signal'],
    halo: `rgb(${halo[0]}, ${halo[1]}, ${halo[2]})`,
  }
}
