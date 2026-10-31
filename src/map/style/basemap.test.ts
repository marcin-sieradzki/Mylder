import '@mylder/perron/tokens.css'
import type { MultiLineString } from 'geojson'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { afterEach, describe, expect, it } from 'vitest'
import { readNetwork, type Network } from '../../timetable/network.ts'
import { encodePolyline, type LatLon } from '../../timetable/polyline.ts'
import { patternHighlight, type Highlight } from '../highlight.ts'
import { readPaint } from '../paint.ts'
import { drawnOf, features, sidesOf } from '../../test/drawnLines.ts'
import { basemapStyle, paintTokens, STOP_LAYERS } from './basemap.ts'

// The basemap as the page paints it: Perron's own token sheet on the document, and the weekday
// recording's network (lines 5C, 991, M1, A, E and RE).
const dir = join(process.cwd(), 'recordings', 'weekday', 'timetable')
const read = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), 'utf8'))
const manifest = read('manifest.json') as { files: Record<string, string> }
const network = readNetwork({
  manifest,
  stops: read(manifest.files.stops),
  patterns: read(manifest.files.patterns),
  paths: read(manifest.files.paths),
})

const styleNow = (highlight?: Highlight) =>
  basemapStyle(
    readPaint(document.documentElement, paintTokens(network, highlight)),
    network,
    highlight,
  )

const layer = (style: StyleSpecification, id: string) => {
  const found = style.layers.find((each) => each.id === id)
  if (!found) throw new Error(`no layer ${id}`)
  return found as LayerSpecification & { paint: Record<string, unknown> }
}

const lineColours = (style: StyleSpecification) =>
  Object.fromEntries(
    features(style, 'mylder-lines').map((f) => [f.properties!.line, f.properties!.colour]),
  )

/** The distance between two [lon, lat] points in km, near enough at Copenhagen's latitude. */
const kilometres = ([lon1, lat1]: number[], [lon2, lat2]: number[]) =>
  Math.hypot((lon2 - lon1) * 111.32 * Math.cos((55.7 * Math.PI) / 180), (lat2 - lat1) * 110.57)

/** The stretch a step between two stops runs, keyed by both stops, lower first. */
const stretchKey = (from: number, to: number) => (from < to ? `${from}-${to}` : `${to}-${from}`)

/**
 * Each line's offset on each stretch it is drawn on, keyed `line|stretch`, as px to the right
 * facing away from the stop `facing` gives for the stretch, by default its lower-numbered: one
 * frame for every line on it, whichever way each runs.
 */
function placesOf(
  style: StyleSpecification,
  on: Network,
  facing: (stretch: string) => number | undefined = (stretch) => Number(stretch.split('-')[0]),
): Map<string, number> {
  const stopOf = (platform: number) => on.stops.platforms[platform].stop
  const runs = new Map<number, { stretch: string; from: number }>()
  for (const pattern of on.patterns.patterns) {
    pattern.segments.forEach((segment, i) => {
      const [from, to] = [stopOf(pattern.stops[i]), stopOf(pattern.stops[i + 1])]
      runs.set(segment, { stretch: stretchKey(from, to), from })
    })
  }
  const places = new Map<string, number>()
  for (const line of new Set(on.patterns.lines.map((each) => each.name))) {
    for (const { offset, segment } of drawnOf(style, on, line)) {
      const { stretch, from } = runs.get(segment)!
      const start = facing(stretch)
      if (start === undefined) continue
      places.set(`${line}|${stretch}`, (from === start ? offset : -offset) || 0)
    }
  }
  return places
}

/**
 * The lines on each stretch of a `line`'s first pattern in its direction 0 where all of `names`
 * run, ordered across the track from left to right as that pattern runs.
 */
function acrossOf(
  style: StyleSpecification,
  on: Network,
  line: string,
  names: readonly string[],
): string[][] {
  const stopOf = (platform: number) => on.stops.platforms[platform].stop
  const index = on.patterns.lines.findIndex((each) => each.name === line)
  const reference = on.patterns.patterns.find(
    (pattern) => pattern.line === index && pattern.direction === 0,
  )!
  const starts = new Map(
    reference.stops.slice(1).map((stop, i) => {
      const from = stopOf(reference.stops[i])
      return [stretchKey(from, stopOf(stop)), from]
    }),
  )
  const byStretch = new Map<string, Map<string, number>>()
  for (const [id, place] of placesOf(style, on, (stretch) => starts.get(stretch))) {
    const [name, stretch] = id.split('|')
    if (!names.includes(name)) continue
    if (!byStretch.has(stretch)) byStretch.set(stretch, new Map())
    byStretch.get(stretch)!.set(name, place)
  }
  return [...byStretch.values()]
    .filter((lines) => lines.size === names.length)
    .map((lines) => [...lines].sort((a, b) => a[1] - b[1]).map(([name]) => name))
}

afterEach(() => {
  delete document.documentElement.dataset.theme
  document.documentElement.removeAttribute('style')
})

describe('the basemap', () => {
  it("paints Positron's land, water and parks in Perron's light map colours", () => {
    const style = styleNow()
    expect(layer(style, 'background').paint['background-color']).toBe('#EDEFEB')
    expect(layer(style, 'water').paint['fill-color']).toBe('#C4D4DD')
    expect(layer(style, 'park').paint['fill-color']).toBe('#D8E4D2')
  })

  it('paints the same map dark under a dark theme', () => {
    document.documentElement.dataset.theme = 'dark'
    const style = styleNow()
    expect(layer(style, 'background').paint['background-color']).toBe('#151B1E')
    expect(layer(style, 'water').paint['fill-color']).toBe('#0A1115')
  })

  it('draws on OpenFreeMap tiles, with no road shields', () => {
    const style = styleNow()
    expect(style.sources.openmaptiles).toMatchObject({
      url: 'https://tiles.openfreemap.org/planet',
    })
    expect(style.layers.filter((each) => /shield/.test(each.id))).toEqual([])
  })

  it("draws each Metro, S-tog and train line in its line's colour, or its mode's", () => {
    expect(lineColours(styleNow())).toEqual({
      M1: '#0B8A44',
      A: '#00A1DE',
      E: '#7D5AA6',
      RE: '#232C31',
    })
    document.documentElement.dataset.theme = 'dark'
    expect(lineColours(styleNow()).RE).toBe('#EEF1F0')
  })

  it("draws each line at its mode's width and opacity", () => {
    const widths = Object.fromEntries(
      features(styleNow(), 'mylder-lines').map((f) => [
        f.properties!.line,
        [f.properties!.width, f.properties!.opacity],
      ]),
    )
    expect(widths).toEqual({ M1: [3.2, 0.78], A: [2.5, 0.78], E: [2.5, 0.78], RE: [2.1, 0.5] })
  })

  it("follows each line's paths, joined from its patterns' segments", () => {
    const m1 = features(styleNow(), 'mylder-lines').find((f) => f.properties!.line === 'M1')!
    const geometry = m1.geometry as MultiLineString
    expect(geometry.type).toBe('MultiLineString')
    // Kongens Nytorv, on M1, is on its path, in longitude and latitude.
    const points = geometry.coordinates.flat()
    expect(
      points.some(([lon, lat]) => Math.abs(lon - 12.585) < 0.003 && Math.abs(lat - 55.68) < 0.003),
    ).toBe(true)
  })

  it('leaves out the straight steps of an unshaped segment, which would cross the country', () => {
    // Line 083 to Hamburg has segments without a shape: two stops joined by a straight step
    // hundreds of km long, or a short shape and then such a step. Given RE a pattern like that:
    const patterns = read(manifest.files.patterns) as {
      patterns: { segments: number[]; line: number }[]
    }
    const paths = read(manifest.files.paths) as { segments: string[] }
    const copenhagen: LatLon = [55.67306, 12.56556]
    const hamburg: LatLon = [53.5525, 10.00666]
    const valby: LatLon = [55.65263, 12.51685]
    const first = paths.segments.push(encodePolyline([copenhagen, hamburg])) - 1
    const second =
      paths.segments.push(encodePolyline([copenhagen, [55.66, 12.54], valby, hamburg])) - 1
    const re = patterns.patterns.find((pattern) => pattern.line === 5)!
    patterns.patterns.push({ ...re, segments: [first, second] })
    const withHamburg = readNetwork({
      manifest,
      stops: read(manifest.files.stops),
      patterns,
      paths,
    })
    const style = basemapStyle(
      readPaint(document.documentElement, paintTokens(withHamburg)),
      withHamburg,
    )
    const lines = features(style, 'mylder-lines').find((f) => f.properties!.line === 'RE')!
    const steps = (lines.geometry as MultiLineString).coordinates.flatMap((line) =>
      line.slice(1).map((point, i) => kilometres(line[i], point)),
    )
    expect(Math.max(...steps)).toBeLessThan(20)
    // The shaped part of the same segment, and RE's own route to Næstved, are still drawn.
    const points = (lines.geometry as MultiLineString).coordinates.flat()
    expect(points).toContainEqual([12.54, 55.66])
    expect(points.some(([, lat]) => lat < 55.3)).toBe(true)
  })

  it('draws lines that share a track side by side, a track spacing apart, centred, each keeping its side', () => {
    // A and E run together from Hundige to Holte, and A alone on to Hillerød. Two lines alone on
    // a track sit half an S-tog track spacing (2.8 px) either side of its centre, in their
    // strands' order: A (strand −2) on one side, E (+1) on the other, all the way along.
    const style = styleNow()
    expect(layer(style, 'mylder-lines-s-tog').paint['line-offset']).toEqual(['get', 'offset'])
    const sides = (name: string) => sidesOf(style, network, name)
    const drawn = (name: string) => drawnOf(style, network, name)

    for (const name of ['A', 'E']) {
      expect(new Set(drawn(name).map(({ offset }) => Math.abs(offset)))).toEqual(
        new Set(name === 'A' ? [0, 1.4] : [1.4, 0]),
      )
      expect(sides(name).size).toBe(1)
    }
    expect([...sides('A'), ...sides('E')].sort()).toEqual([-1, 1])
    // Each stretch once per line: the way back is the same strand, not a mirror of it.
    const a = drawn('A').map(({ segment }) => segment)
    expect(new Set(a).size).toBe(a.length)
    expect(a.length).toBeLessThan(
      new Set(
        network.patterns.patterns
          .filter((pattern) => network.patterns.lines[pattern.line].name === 'A')
          .flatMap((pattern) => pattern.segments),
      ).size,
    )
  })

  it('puts each line on the same side whatever order the timetable lists its patterns in', () => {
    const patterns = read(manifest.files.patterns) as { patterns: unknown[] }
    const reordered = readNetwork({
      manifest,
      stops: read(manifest.files.stops),
      patterns: { ...patterns, patterns: patterns.patterns.toReversed() },
      paths: read(manifest.files.paths),
    })
    const paint = readPaint(document.documentElement, paintTokens(network))
    const places = placesOf(basemapStyle(paint, network), network)
    expect([...places.values()].some((place) => place !== 0)).toBe(true)
    expect(placesOf(basemapStyle(paint, reordered), reordered)).toEqual(places)
  })

  it("places a line without a strand of its own by its parent line's, or else outside the others", () => {
    // Given E's patterns to two more S-tog lines without a colour of their own: Ex, an express
    // of E, takes E's strand and sits beside it; Q has no parent and goes beyond every line with
    // a strand, rather than between A and E.
    const file = read(manifest.files.patterns) as {
      lines: { name: string; mode: string; colour: string }[]
      patterns: { line: number }[]
    }
    const e = file.lines.findIndex((line) => line.name === 'E')
    const extra = ['Ex', 'Q'].map((name) => {
      const line =
        file.lines.push({ name, mode: 's-tog', colour: 'perron-color-transit-mode-regional' }) - 1
      return file.patterns
        .filter((pattern) => pattern.line === e)
        .map((pattern) => ({ ...pattern, line }))
    })
    file.patterns.push(...extra.flat())
    const withMore = readNetwork({
      manifest,
      stops: read(manifest.files.stops),
      patterns: file,
      paths: read(manifest.files.paths),
    })
    const style = basemapStyle(readPaint(document.documentElement, paintTokens(withMore)), withMore)
    const orders = acrossOf(style, withMore, 'E', ['A', 'E', 'Ex', 'Q'])
    expect(orders.length).toBeGreaterThan(0)
    const order = orders[0][0] === 'A' ? ['A', 'E', 'Ex', 'Q'] : ['Q', 'Ex', 'E', 'A']
    for (const each of orders) expect(each).toEqual(order)
  })

  it("keeps a line alone on its track on the centre, beside another mode's line too", () => {
    // M1 is the only metro line, and RE meets E only between Køge Nord and Køge, on its own track.
    const offsets = new Set(
      features(styleNow(), 'mylder-lines')
        .filter((f) => ['M1', 'RE'].includes(f.properties!.line))
        .map((f) => f.properties!.offset),
    )
    expect(offsets).toEqual(new Set([0]))
  })

  it('leaves the bus routes out at rest, as Perron draws a bus route only in focus', () => {
    expect(Object.keys(lineColours(styleNow()))).not.toContain('5C')
  })

  it('draws every stop, above the lines and under the place names', () => {
    const style = styleNow()
    expect(features(style, 'mylder-stops')).toHaveLength(109)
    const index = (id: string) => style.layers.findIndex((each) => each.id === id)
    const firstLabel = style.layers.findIndex((each) => each.type === 'symbol')
    expect(index('mylder-lines-metro')).toBeGreaterThan(index('mylder-lines-train'))
    expect(index('mylder-stops-rail')).toBeGreaterThan(index('mylder-lines-metro'))
    expect(index('mylder-stops-rail')).toBeLessThan(firstLabel)
  })

  it('gives each drawn stop its id, in the layers a tap on a stop reads', () => {
    const style = styleNow()
    const norreport = features(style, 'mylder-stops').find(
      (f) => f.properties!.name === 'Nørreport St.',
    )
    expect(norreport?.properties).toMatchObject({ id: '27532', rail: true })
    for (const id of STOP_LAYERS) expect(style.layers.some((each) => each.id === id)).toBe(true)
  })

  it('raises the buildings from zoom 14 from their OpenStreetMap heights, flat footprints below', () => {
    const style = styleNow()
    const raised = layer(style, 'building-3d')
    expect(raised).toMatchObject({
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
    })
    expect(raised.paint['fill-extrusion-height']).toEqual(['get', 'render_height'])
    expect(raised.paint['fill-extrusion-base']).toEqual(['get', 'render_min_height'])
    const flat = layer(style, 'building')
    expect(flat).toMatchObject({ type: 'fill', minzoom: 12, maxzoom: 14 })
    expect(flat.paint['fill-color']).toBe('#E2E5E0')
  })

  it('leaves out the buildings OpenStreetMap flags hide_3d', () => {
    expect(layer(styleNow(), 'building-3d')).toMatchObject({
      filter: ['!=', ['get', 'hide_3d'], true],
    })
  })

  it("paints the buildings in Perron's 3D building colour, in light and dark", () => {
    const light = layer(styleNow(), 'building-3d').paint
    expect(light['fill-extrusion-color']).toBe('#D3D9D4')
    expect(light['fill-extrusion-opacity']).toBe(0.6)
    document.documentElement.dataset.theme = 'dark'
    const dark = layer(styleNow(), 'building-3d').paint
    expect(dark['fill-extrusion-color']).toBe('#2A3338')
    expect(dark['fill-extrusion-opacity']).toBe(0.6)
  })

  it("draws the buildings at Perron's 3D building opacity, with no stand-in of its own", () => {
    document.documentElement.style.setProperty('--perron-opacity-map-building-3d', '0.35')
    expect(layer(styleNow(), 'building-3d').paint['fill-extrusion-opacity']).toBe(0.35)
  })

  it('draws the buildings over the streets and rail, and under the lines, stops and highlight', () => {
    const style = styleNow(patternHighlight(network, 0))
    const index = (id: string) => style.layers.findIndex((each) => each.id === id)
    const raised = index('building-3d')
    const basemap = style.layers.filter((each) => !each.id.startsWith('mylder-'))
    const lastGround = basemap.findLastIndex((each) => each.type !== 'symbol')
    expect(basemap[lastGround].id).toBe('building-3d')
    for (const id of ['mylder-lines-train', 'mylder-stops-bus', 'mylder-stops-rail']) {
      expect(index(id)).toBeGreaterThan(raised)
    }
    for (const id of STOP_LAYERS) expect(index(id)).toBeGreaterThan(raised)
    expect(index('mylder-highlight-lines')).toBeGreaterThan(raised)
  })

  it('draws the basemap alone until the network has loaded', () => {
    const style = basemapStyle(readPaint(document.documentElement, paintTokens()))
    expect(layer(style, 'background').paint['background-color']).toBe('#EDEFEB')
    expect(style.sources['mylder-lines']).toBeUndefined()
  })
})

describe('a highlight on the basemap', () => {
  const patternOf = (line: string, headsign: string) =>
    network.patterns.patterns.findIndex(
      (each) => network.patterns.lines[each.line].name === line && each.headsign === headsign,
    )
  const busLine = () => patternHighlight(network, patternOf('5C', 'Husum Torv'))
  const index = (style: StyleSpecification, id: string) =>
    style.layers.findIndex((each) => each.id === id)

  it('draws the highlighted line in its colour, wider than at rest, and rings its stops', () => {
    const m1 = patternHighlight(network, patternOf('M1', 'Vestamager St. (Metro)'))
    const style = styleNow(m1)
    const [line, ...others] = features(style, 'mylder-highlight-lines')
    expect(others).toEqual([])
    // Metro's 3.2 px and the focus's 1.6 px more, in M1's green.
    expect(line.properties).toMatchObject({ colour: '#0B8A44', width: 4.8 })
    expect((line.geometry as MultiLineString).coordinates.flat()).toHaveLength(
      network.pathOf(patternOf('M1', 'Vestamager St. (Metro)')).points.length,
    )
    const stops = features(style, 'mylder-highlight-stops')
    expect(stops).toHaveLength(15)
    expect(stops[0].properties).toMatchObject({ colour: '#0B8A44' })
  })

  it("draws a bus route, which is never drawn at rest, at the bus's focus width", () => {
    const [line] = features(styleNow(busLine()), 'mylder-highlight-lines')
    expect(line.properties).toMatchObject({ width: 4 })
  })

  it('dims every line and stop outside the focus', () => {
    const style = styleNow(busLine())
    const opacities = features(style, 'mylder-lines').map((f) => f.properties!.opacity)
    expect(new Set(opacities)).toEqual(new Set([0.16]))
    expect(layer(style, 'mylder-stops-rail').paint['circle-opacity']).toBe(0.3)
    expect(layer(style, 'mylder-stops-rail').paint['circle-stroke-opacity']).toBe(0.3)
  })

  it('draws the highlight over the lines and stops and under the place names', () => {
    const style = styleNow(busLine())
    const firstLabel = style.layers.findIndex((each) => each.type === 'symbol')
    expect(index(style, 'mylder-highlight-lines')).toBeGreaterThan(
      index(style, 'mylder-stops-rail'),
    )
    expect(index(style, 'mylder-highlight-stops')).toBeGreaterThan(
      index(style, 'mylder-highlight-lines'),
    )
    expect(index(style, 'mylder-highlight-stops')).toBeLessThan(firstLabel)
  })

  it("carries each ringed stop's id, so a tap on a ring opens its departures", () => {
    const ringed: Highlight = {
      label: { kind: 'text', text: 'Signalfejl' },
      lines: [],
      stops: [
        { id: '8600626', point: [55.6731, 12.5656], colour: 'perron-color-transit-severity-delay' },
      ],
    }
    const [stop] = features(styleNow(ringed), 'mylder-highlight-stops')
    expect(stop.properties).toMatchObject({ id: '8600626' })
    expect(STOP_LAYERS).toContain('mylder-highlight-stops')
  })

  it('draws nothing in focus, and dims nothing, while nothing is highlighted', () => {
    const style = styleNow()
    expect(features(style, 'mylder-highlight-lines')).toEqual([])
    expect(features(style, 'mylder-highlight-stops')).toEqual([])
    expect(layer(style, 'mylder-stops-rail').paint['circle-opacity']).toBe(1)
  })
})
