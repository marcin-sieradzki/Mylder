import '@mylder/perron/tokens.css'
import { afterEach, describe, expect, it } from 'vitest'
import type { DataState } from '../domain/data-state.ts'
import type { Mode } from '../timetable/format.ts'
import { readPaint } from './paint.ts'
import { glyphOf, lookOf, parseColour, radiusScaleAt, vehicleTokens, type RGBA } from './glyphs.ts'

// Each data state's glyph as Perron's data-states page draws it, from Perron's own token sheet.
const root = document.documentElement

const look = () => lookOf(readPaint(root, vehicleTokens()))

const A: RGBA = [0x00, 0xa1, 0xde, 255]
const M2: RGBA = [0xf0, 0xb4, 0x00, 255]

afterEach(() => {
  delete root.dataset.theme
})

describe("a vehicle's glyph", () => {
  it.each<[string, DataState, Mode, RGBA, object]>([
    [
      'Live is a solid dot in its colour',
      'live',
      's-tog',
      A,
      { radius: 4.8, lineWidth: 0, fill: A, dash: [0, 0], cut: 0 },
    ],
    [
      'Ageing is a fainter fill with a rim pulled in',
      'ageing',
      's-tog',
      A,
      { radius: 4.2, lineWidth: 1.3, fill: [0x00, 0xa1, 0xde, 107], line: A, cut: 0 },
    ],
    [
      'Estimated is a ring',
      'estimated',
      'metro',
      A,
      { radius: 3.7, lineWidth: 1.8, fill: [0x00, 0xa1, 0xde, 0], line: A, dash: [0, 0] },
    ],
    [
      'Timetable only is a dashed ring, its dashes in stroke widths',
      'timetable-only',
      'bus',
      A,
      { radius: 2.4, lineWidth: 1.6, line: A, dash: [2.1 / 1.6, 1.7 / 1.6] },
    ],
    [
      'No signal is grey, cut by a diagonal gap',
      'no-signal',
      'train',
      A,
      { radius: 5.3, lineWidth: 0, fill: [0x9a, 0xa4, 0xa9, 255], cut: 1.6 },
    ],
  ])('%s', (_, state, mode, colour, expected) => {
    const glyph = glyphOf(state, mode, colour, look())
    expect({ ...glyph, radius: round(glyph.radius), dash: glyph.dash.map(round) }).toMatchObject({
      ...expected,
      ...('dash' in expected ? { dash: (expected.dash as number[]).map(round) } : {}),
    })
  })

  it('gives a light colour a hairline on the light map, and none on the dark', () => {
    expect(glyphOf('live', 'metro', M2, look())).toMatchObject({
      lineWidth: 1,
      line: [18, 24, 27, 115],
      fill: M2,
    })
    expect(round(glyphOf('live', 'metro', M2, look()).radius)).toBe(4.1)
    root.dataset.theme = 'dark'
    expect(glyphOf('live', 'metro', M2, look())).toMatchObject({ lineWidth: 0, radius: 4.6 })
  })

  it('takes the No signal grey and the halo from the theme', () => {
    expect(look().halo).toEqual({ width: 1.6, colour: [0xed, 0xef, 0xeb, 255] })
    root.dataset.theme = 'dark'
    expect(glyphOf('no-signal', 'bus', A, look()).fill).toEqual([0x5f, 0x6b, 0x71, 255])
    expect(look().halo.colour).toEqual([0x15, 0x1b, 0x1e, 255])
  })
})

describe('a colour', () => {
  it.each<[string, RGBA | undefined]>([
    ['#00A1DE', [0, 161, 222, 255]],
    ['#0a1', [0, 170, 17, 255]],
    ['#00000080', [0, 0, 0, 128]],
    ['rgba(18, 24, 27, 0.45)', [18, 24, 27, 115]],
    ['rgb(1 2 3 / 50%)', [1, 2, 3, 128]],
    ['rgb(10, 20, 30)', [10, 20, 30, 255]],
    ['', undefined],
    ['oklch(70% 0.1 200)', undefined],
  ])('%s', (css, rgba) => {
    expect(parseColour(css)).toEqual(rgba)
  })
})

describe("a dot's size by zoom", () => {
  it("is Perron's size at street zoom, 60% across the city, and 120% close in", () => {
    expect(radiusScaleAt(14)).toBe(1)
    expect(radiusScaleAt(9)).toBe(0.6)
    expect(radiusScaleAt(17)).toBe(1.2)
    expect(radiusScaleAt(11.2)).toBeGreaterThan(0.6)
    expect(radiusScaleAt(11.2)).toBeLessThan(radiusScaleAt(12))
  })
})

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
