// Perron's values for the map, read from the published tokens where they exist.
// `@mylder/perron` 0.1.0 (npm) has color.map.*, color.data-state.*, color.transit.*,
// map.dot-radius.* and opacity.map-*. The vehicle-dot.* geometry arrived with 0.2.0, which
// is not on npm yet, so those values are copied here from packages/perron/tokens/base.tokens.json.
import { base, theme as themes, numeric } from '@mylder/perron/tokens.ts'

export type Theme = 'light' | 'dark'
export type Mode = 'bus' | 'metro' | 'stog' | 'regional'
export type RGBA = [number, number, number, number]

/** vehicle-dot.* (Perron 0.2.0, copied). Pixels, except the opacity. */
export const vehicleDot = {
  halo: 1.6,
  ageing: { fillOpacity: 0.42, strokeWidth: 1.3, strokeInset: 0.6 },
  estimated: { strokeWidth: 1.8, strokeInset: 0.9 },
  timetable: { strokeWidth: 1.6, strokeInset: 0.9, dash: [2.1, 1.7] as const },
  noSignal: { cutWidth: 1.6 },
} as const

/** map.dot-radius.* in px at the default zoom. */
export const dotRadius: Record<Mode, number> = {
  bus: numeric['map.dot-radius.bus'],
  metro: numeric['map.dot-radius.metro'],
  stog: numeric['map.dot-radius.stog'],
  regional: numeric['map.dot-radius.regional'],
}

/** map.line-width.* and map.track-spacing.* for the rail lines drawn in the basemap. */
export const lineWidth: Record<Exclude<Mode, 'bus'>, number> = {
  metro: numeric['map.line-width.metro'],
  stog: numeric['map.line-width.stog'],
  regional: numeric['map.line-width.regional'],
}
export const trackSpacing: Record<Exclude<Mode, 'bus'>, number> = {
  metro: numeric['map.track-spacing.metro'],
  stog: numeric['map.track-spacing.stog'],
  regional: numeric['map.track-spacing.regional'],
}

export const opacity = {
  line: Number(base['opacity.map-line']),
  lineRegional: Number(base['opacity.map-line-regional']),
  trail: Number(base['opacity.map-trail']),
}

export function tokens(t: Theme) {
  return themes[t]
}

const lineTokens: Record<string, keyof typeof base> = {
  M1: 'color.transit.line.m1',
  M2: 'color.transit.line.m2',
  M3: 'color.transit.line.m3',
  M4: 'color.transit.line.m4',
  A: 'color.transit.line.a',
  B: 'color.transit.line.b',
  C: 'color.transit.line.c',
  E: 'color.transit.line.e',
  F: 'color.transit.line.f',
  H: 'color.transit.line.h',
}

/** The colour a vehicle carries: its line's colour for metro and S-tog, the mode colour for bus and regional. */
export function lineColour(lineId: string, mode: Mode, t: Theme): string {
  if (mode === 'bus') return themes[t]['color.transit.mode.bus']
  if (mode === 'regional') return themes[t]['color.transit.mode.regional']
  const key = lineTokens[lineId]
  return key ? base[key] : themes[t]['color.text.primary']
}

export function parseColour(css: string): RGBA {
  const s = css.trim()
  if (s.startsWith('#')) {
    const h = s.slice(1)
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
    return [n(0), n(2), n(4), h.length >= 8 ? n(6) : 255]
  }
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x))
    return [p[0], p[1], p[2], p.length > 3 ? Math.round(p[3] * 255) : 255]
  }
  throw new Error(`Unparsed colour ${css}`)
}

/** Relative luminance, 0..1, for the "light colour on a light map" hairline rule. */
export function luminance([r, g, b]: RGBA): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
