import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readNetwork } from '../timetable/network.ts'
import type { Disruptions } from '../tracker/index.ts'
import {
  boundsOf,
  disruptionHighlight,
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
  it("is its pattern's path and stops, in its line's colour, named by its line, each stop by its id", () => {
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
      id: network.stops.stops[network.stops.platforms[network.patterns.patterns[m1].stops[0]].stop]
        .id,
      point: [expect.closeTo(55.6873, 3), expect.closeTo(12.4914, 3)],
      colour: 'perron-color-transit-line-m1',
    })
  })
})

/** The weekday recording's messages, as the disruption route served them. */
const [busDiversion, signalFault] = (read('answers/disruptions/0001.json') as Disruptions).messages
const SEVERITY = 'perron-color-transit-severity-notice'

describe("a disruption's stretch and stops", () => {
  it('rings each stop it affects, in its severity colour, each with its id for a tap to open', () => {
    const highlight = disruptionHighlight(network, signalFault!, 'notice')
    expect(highlight.label).toEqual({
      kind: 'text',
      text: 'Færre S-tog mellem København H og Hellerup',
    })
    expect(highlight.stops.map(({ id, colour }) => [id, colour])).toEqual([
      ['8600626', SEVERITY],
      ['8600655', SEVERITY],
    ])
  })

  it('draws the stretch between its two ends along every pattern that runs through both', () => {
    const { lines } = disruptionHighlight(network, signalFault!, 'notice')
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line).toMatchObject({ mode: 's-tog', colour: SEVERITY })
      const [first, last] = [line.points[0]!, line.points.at(-1)!]
      // From København H to Hellerup St., one way or the other.
      const ends = [first, last].map(([lat]) => Math.round(lat * 100) / 100).sort()
      expect(ends).toEqual([55.67, 55.73])
    }
    // Each stretch once, whichever way its patterns run along it.
    const drawn = lines.map((line) => JSON.stringify(line.points))
    const reversed = lines.map((line) => JSON.stringify(line.points.toReversed()))
    expect(new Set([...drawn, ...reversed]).size).toBe(2 * drawn.length)
  })

  it('draws no stretch between two platforms of one stop, and rings that stop once', () => {
    const highlight = disruptionHighlight(network, busDiversion!, 'notice')
    expect(highlight.lines).toEqual([])
    expect(highlight.stops.map(({ id }) => id)).toEqual(['807'])
  })

  it('leaves out the stops the timetable does not know', () => {
    const outside = {
      ...signalFault!,
      message: {
        ...signalFault!.message,
        affectedStops: {
          StopLocation: [{ name: 'Aarhus H', extId: '8600053', lon: 10.2, lat: 56.15 }],
        },
        validFromStop: undefined,
        validToStop: undefined,
      },
    }
    expect(disruptionHighlight(network, outside, 'notice')).toMatchObject({ lines: [], stops: [] })
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

  it('keeps the chip clear of page notices that push it down, and clear of the legend', () => {
    // Two notices under the top bar reach 180px down; the legend reaches 260px up.
    expect(fitPadding(1280, 800, { top: 180, bottom: 260 })).toEqual({
      top: 246,
      right: 400,
      bottom: 284,
      left: 412,
    })
  })

  it('keeps its own padding where what floats is smaller, or not measured', () => {
    expect(fitPadding(1280, 800, { top: 0, bottom: 0 })).toEqual(fitPadding(1280, 800))
    expect(fitPadding(390, 844, { top: 100 })).toEqual(fitPadding(390, 844))
  })

  it('keeps the chip clear of a notice on a phone, where the peek already clears the legend', () => {
    // The top bar's two rows and a notice under them reach 190px down.
    expect(fitPadding(390, 844, { top: 190, bottom: 260 })).toEqual({
      top: 256,
      right: 24,
      bottom: 218,
      left: 24,
    })
  })

  it('gives up the bottom first on a short window, so the chip stays clear longest', () => {
    expect(fitPadding(1280, 600, { top: 180, bottom: 260 })).toMatchObject({
      top: 246,
      bottom: 154,
    })
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
