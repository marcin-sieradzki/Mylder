import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readNetwork } from '../timetable/network.ts'
import {
  boundsOf,
  fitPadding,
  highlightStore,
  patternHighlight,
  type Highlight,
} from './highlight.ts'

// The map's highlight (docs/screens.md, "The highlight chip"): what is highlighted, from Show
// whole line or a disruption's Show on map, where the camera fits it, and the store the canvas
// and the chip read. On the weekday recording's own timetable.
const recording = join(process.cwd(), 'recordings', 'weekday')
const read = (path: string): unknown => JSON.parse(readFileSync(join(recording, path), 'utf8'))
const manifest = read('timetable/manifest.json') as { files: Record<string, string> }
const network = readNetwork({
  manifest,
  stops: read(`timetable/${manifest.files.stops}`),
  patterns: read(`timetable/${manifest.files.patterns}`),
  paths: read(`timetable/${manifest.files.paths}`),
})
const patternOf = (line: string, headsign: string) =>
  network.patterns.patterns.findIndex(
    (each) => network.patterns.lines[each.line].name === line && each.headsign === headsign,
  )

/** A stretch of two lines and a stop, drawn by hand, around Nørreport. */
const stretch: Highlight = {
  label: { kind: 'text', text: 'Signalfejl ved Nørreport' },
  lines: [
    {
      mode: 's-tog',
      colour: 'perron-color-transit-line-a',
      points: [
        [55.6833, 12.5716],
        [55.689, 12.56],
      ],
    },
    {
      mode: 'metro',
      colour: 'perron-color-transit-line-m1',
      points: [
        [55.6795, 12.5857],
        [55.6762, 12.5791],
      ],
    },
  ],
  stops: [{ point: [55.701, 12.552], colour: 'perron-color-status-danger' }],
}

describe("a trip's whole line", () => {
  it("is its pattern's path and stops, in its line's colour, named by its line", () => {
    const m1 = patternOf('M1', 'Vestamager St. (Metro)')
    const highlight = patternHighlight(network, m1)
    expect(highlight.label).toEqual({ kind: 'line', line: 'M1' })
    expect(highlight.lines).toEqual([
      {
        mode: 'metro',
        colour: 'perron-color-transit-line-m1',
        points: network.pathOf(m1).points,
      },
    ])
    expect(highlight.stops).toHaveLength(15)
    expect(highlight.stops[0]).toEqual({
      point: [expect.closeTo(55.6873, 3), expect.closeTo(12.4914, 3)],
      colour: 'perron-color-transit-line-m1',
    })
  })
})

describe("the highlight's bounds", () => {
  it('hold every line and stop, from the south-west corner to the north-east', () => {
    expect(boundsOf(stretch)).toEqual([
      [12.552, 55.6762],
      [12.5857, 55.701],
    ])
  })

  it('hold the whole of a line, end to end', () => {
    const [[west, south], [east, north]] = boundsOf(
      patternHighlight(network, patternOf('M1', 'Vestamager St. (Metro)')),
    )!
    // Vanløse in the north-west, Vestamager in the south.
    expect(west).toBeCloseTo(12.4914, 3)
    expect(north).toBeCloseTo(55.6873, 3)
    expect(south).toBeLessThan(55.63)
    expect(east).toBeGreaterThan(12.58)
  })

  it('are none for a highlight with nothing to draw', () => {
    expect(boundsOf({ ...stretch, lines: [], stops: [] })).toBeUndefined()
  })
})

describe('the fit', () => {
  it('keeps clear of the top bar, the chip, the sheet and the panel on a desktop', () => {
    expect(fitPadding(1280, 800)).toEqual({ top: 146, right: 400, bottom: 48, left: 412 })
  })

  it('keeps clear of the top bar, the chip and the bottom sheet on a phone', () => {
    expect(fitPadding(390, 844)).toEqual({ top: 192, right: 24, bottom: 218, left: 24 })
  })

  it('pads less on a window too small for the full padding, so the fit still has room', () => {
    const padding = fitPadding(900, 400)
    expect(padding.left + padding.right).toBeLessThanOrEqual(900 - 200)
    expect(padding.top + padding.bottom).toBeLessThanOrEqual(400 - 200)
  })
})

describe('the highlight', () => {
  it('shows what it was given until cleared, and tells its listeners each time', () => {
    const store = highlightStore()
    let heard = 0
    store.subscribe(() => heard++)
    expect(store.get()).toBeUndefined()
    store.show(stretch)
    expect(store.get()).toBe(stretch)
    store.clear()
    expect(store.get()).toBeUndefined()
    store.clear()
    expect(heard).toBe(2)
  })

  it('takes the place of the one shown before', () => {
    const store = highlightStore()
    const line = patternHighlight(network, patternOf('5C', 'Husum Torv'))
    store.show(stretch)
    store.show(line)
    expect(store.get()?.label).toEqual({ kind: 'line', line: '5C' })
  })
})
