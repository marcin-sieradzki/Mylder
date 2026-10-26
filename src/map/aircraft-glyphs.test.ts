import '@mylder/perron/tokens.css'
import { afterEach, describe, expect, it } from 'vitest'
import type { AircraftState } from '../domain/aircraft-state.ts'
import { aircraftIcon, aircraftLookNow } from '../test/aircraftIcon.ts'
import { aircraftGlyphOf, outlineOf } from './aircraft-glyphs.ts'
import type { RGBA } from './glyphs.ts'

// Each data state's aircraft glyph as Perron's Map page draws it, from Perron's own token sheet.
const root = document.documentElement

const look = aircraftLookNow

const MAGENTA: RGBA = [0xb3, 0x12, 0x7a, 255]

afterEach(() => {
  delete root.dataset.theme
})

describe("an aircraft's glyph", () => {
  it.each<[string, AircraftState, object]>([
    [
      'Live is the outline filled in the aircraft colour',
      'live',
      { fill: MAGENTA, rim: 0, cut: 0 },
    ],
    [
      'Ageing is filled at the dots’ ageing strength, with a 1 px rim',
      'ageing',
      { fill: [0xb3, 0x12, 0x7a, 107], line: MAGENTA, rim: 1, cut: 0 },
    ],
    [
      'Estimated is hollow, a 1.2 px line inside the outline',
      'estimated',
      { fill: [0xb3, 0x12, 0x7a, 0], line: MAGENTA, rim: 1.2, cut: 0 },
    ],
    [
      'No signal is grey, cut by the dots’ diagonal gap',
      'no-signal',
      { fill: [0x9a, 0xa4, 0xa9, 255], rim: 0, cut: 1.6 },
    ],
  ])('%s', (_, state, expected) => {
    expect(aircraftGlyphOf(state, { altitude: 3500, track: 0 }, look())).toMatchObject({
      size: 18,
      ...expected,
    })
  })

  it('keeps the same box in every state: the rims are drawn inside the outline', () => {
    const sizes = (['live', 'ageing', 'estimated', 'no-signal'] as const).map(
      (state) => aircraftGlyphOf(state, { altitude: 3500, track: 0 }, look()).size,
    )
    expect(new Set(sizes)).toEqual(new Set([18]))
  })

  it('is smaller on the ground', () => {
    expect(aircraftGlyphOf('live', { altitude: 'ground', track: 90 }, look()).size).toBe(14)
  })

  it('turns clockwise from north to the track, as deck.gl turns an icon the other way', () => {
    expect(aircraftGlyphOf('live', { altitude: 3500, track: 90 }, look()).angle).toBe(-90)
    expect(aircraftGlyphOf('live', { altitude: 3500, track: 225 }, look()).angle).toBe(-225)
    expect(aircraftGlyphOf('live', { altitude: 3500 }, look()).angle).toBe(-0)
  })

  it('takes its colour, the No signal grey and the halo from the theme', () => {
    expect(look().halo).toEqual({ width: 1.6, colour: [0xed, 0xef, 0xeb, 255] })
    root.dataset.theme = 'dark'
    expect(aircraftGlyphOf('live', { altitude: 3500 }, look()).fill).toEqual([
      0xf2, 0x7b, 0xc8, 255,
    ])
    expect(aircraftGlyphOf('no-signal', { altitude: 3500 }, look()).fill).toEqual([
      0x5f, 0x6b, 0x71, 255,
    ])
    expect(look().halo.colour).toEqual([0x15, 0x1b, 0x1e, 255])
  })
})

describe("Perron's aircraft icon", () => {
  it('gives the outline the glyph draws, on its 14 px grid', () => {
    expect(outlineOf(aircraftIcon)).toMatch(/^M7 1C.*Z$/)
  })

  it('gives the same outline from the file as a build inlines it, its quotes single', () => {
    expect(outlineOf(aircraftIcon.replaceAll('"', "'"))).toBe(outlineOf(aircraftIcon))
  })

  it('gives none for a file with no outline', () => {
    expect(outlineOf('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBeUndefined()
  })
})
