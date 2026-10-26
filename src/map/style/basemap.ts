// The basemap's style: the forked Positron (positron.json, licence beside it) on OpenFreeMap's
// tiles, repainted from Perron's map tokens, with the timetable's line paths and stops drawn
// under the place names (docs/screens.md, "The moving map"; ADR 0003). Positron's layers,
// filters, widths and zooms stay; only the paint changes, so light and dark are one map.
import 'client-only'
import type { Feature, FeatureCollection, MultiLineString, Point } from 'geojson'
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { distance } from '../../domain/trip-motion.ts'
import type { LineRecord, Mode } from '../../timetable/format.ts'
import type { Network } from '../../timetable/network.ts'
import type { LatLon } from '../../timetable/polyline.ts'
import { modeColour, numberOf, type Paint } from '../paint.ts'
import positron from './positron.json'
import { patternPlaces, strandsOf, type StrandOf } from './strands.ts'

type MapColour =
  | 'water'
  | 'land'
  | 'park'
  | 'street'
  | 'airport'
  | 'runway'
  | 'building'
  | 'rail'
  | 'label'
  | 'water-label'

const map = (colour: MapColour) => `perron-color-map-${colour}`

// Which map colour paints which Positron layer, as the map-layer prototype (#14) settled it.
// Casings and building outlines have no token of their own and take `runway`, the mid neutral
// between land and rail; boundaries take `rail`; the gaps in dashed rail take `land`.
const FILL: readonly [RegExp, MapColour][] = [
  [/^background$/, 'land'],
  [/^(park|landcover_wood)$/, 'park'],
  [/^water$/, 'water'],
  [/^(landcover_ice_shelf|landcover_glacier|landuse_residential|road_area_pier)$/, 'land'],
  [/^building$/, 'building'],
  [/^aeroway-area$/, 'airport'],
]
const LINE: readonly [RegExp, MapColour][] = [
  [/^road_pier$/, 'land'],
  [/^waterway$/, 'water'],
  [/_casing$/, 'runway'],
  [/^(tunnel_motorway_inner|highway_(path|minor|major_inner|major_subtle))$/, 'street'],
  [/^highway_motorway_(inner|subtle|bridge_inner)$/, 'street'],
  [/^aeroway-(taxiway|runway)$/, 'runway'],
  [/_dashline$/, 'land'],
  [/^railway/, 'rail'],
  [/^boundary/, 'rail'],
]

/**
 * The rail modes, bottom to top: each drawn at its mode's width and opacity, its lines that share
 * a track its track spacing apart.
 */
const RAIL: readonly {
  mode: Mode
  layer: string
  width: string
  opacity: string
  spacing: string
}[] = [
  {
    mode: 'train',
    layer: 'mylder-lines-train',
    width: 'perron-map-line-width-regional',
    opacity: 'perron-opacity-map-line-regional',
    spacing: 'perron-map-track-spacing-regional',
  },
  {
    mode: 'light-rail',
    layer: 'mylder-lines-light-rail',
    width: 'perron-map-line-width-regional',
    opacity: 'perron-opacity-map-line-regional',
    spacing: 'perron-map-track-spacing-regional',
  },
  {
    mode: 's-tog',
    layer: 'mylder-lines-s-tog',
    width: 'perron-map-line-width-stog',
    opacity: 'perron-opacity-map-line',
    spacing: 'perron-map-track-spacing-stog',
  },
  {
    mode: 'metro',
    layer: 'mylder-lines-metro',
    width: 'perron-map-line-width-metro',
    opacity: 'perron-opacity-map-line',
    spacing: 'perron-map-track-spacing-metro',
  },
]

const LINE_COLOUR = 'perron-color-transit-line-'

/**
 * A line's `map.strand.*` token, its place on the full trunk, for a line with a colour of its
 * own, `perron-color-transit-line-a` giving `perron-map-strand-a`; none for any other line.
 */
const strandToken = (line: LineRecord): string | undefined =>
  line.colour.startsWith(LINE_COLOUR)
    ? `perron-map-strand-${line.colour.slice(LINE_COLOUR.length)}`
    : undefined

/** The rail lines of the network with a strand token of their own. */
const strandedLines = (network: Network): LineRecord[] =>
  network.patterns.lines.filter((line) => line.mode !== 'bus' && strandToken(line))

/**
 * Each line's strand from its token, or, for a line without one, its parent's: the line of its
 * mode with a token whose name its own starts with, the longest, so Bx rides beside B. A line with
 * neither has none, and goes beyond the lines that have one.
 */
function strandsByToken(paint: Paint, network: Network): StrandOf {
  const stranded = strandedLines(network).sort((a, b) => b.name.length - a.name.length)
  const own = (line: LineRecord) => numberOf(paint, strandToken(line)!)
  return (line) => {
    if (strandToken(line)) return own(line)
    const parent = stranded.find(
      (each) => each.mode === line.mode && line.name.startsWith(each.name),
    )
    return parent && own(parent)
  }
}

/** The tokens a line's offset reads: each rail mode's track spacing and each line's strand. */
export const strandTokens = (network?: Network): string[] => [
  ...RAIL.map(({ spacing }) => spacing),
  ...(network ? strandedLines(network).map((line) => strandToken(line)!) : []),
]

/** A line's offset in px for its `place` in track spacings, as the style draws it. */
function offsetOf(paint: Paint, line: LineRecord, place: number): number {
  const spacing = numberOf(paint, RAIL.find(({ mode }) => mode === line.mode)!.spacing)
  return Math.round(place * spacing * 100) / 100 || 0
}

const offsetsBuilt = new WeakMap<Network, { readonly paint: string; readonly offsets: Offsets }>()

type Offsets = readonly (Float32Array | undefined)[]

/**
 * Each pattern's offset on each of its steps, in px to the right of the way it runs: its line's
 * strand there, so a vehicle on the step rides on the strand its line is drawn on. None for a bus
 * route's. Worked out once per network and paint.
 */
export function vehicleOffsets(paint: Paint, network: Network): Offsets {
  const read = strandTokens(network)
    .map((token) => paint.get(token))
    .join()
  const found = offsetsBuilt.get(network)
  if (found?.paint === read) return found.offsets
  const { lines, patterns } = network.patterns
  const offsets = patternPlaces(network, strandsByToken(paint, network)).map((places, index) => {
    if (!places) return undefined
    const line = lines[patterns[index].line]
    return Float32Array.from(places, (place) => offsetOf(paint, line, place))
  })
  offsetsBuilt.set(network, { paint: read, offsets })
  return offsets
}

const STOP_FILL = map('land')
const STOP_RING = map('label')

/**
 * Every token the style reads, for `readPaint`: the map's colours, the line widths, opacities
 * and track spacings, and the colour and strand of each line the network draws.
 */
export function paintTokens(network?: Network): string[] {
  const lines = network ? drawnLines(network) : []
  return [
    ...FILL.map(([, colour]) => map(colour)),
    ...LINE.map(([, colour]) => map(colour)),
    map('label'),
    map('water-label'),
    ...RAIL.flatMap(({ width, opacity }) => [width, opacity]),
    modeColour('bus'),
    modeColour('train'),
    ...lines.map((line) => line.colour),
    ...strandTokens(network),
  ]
}

/** The style for the paint read now, with the network's lines and stops once it has loaded. */
export function basemapStyle(paint: Paint, network?: Network): StyleSpecification {
  const colour = (name: MapColour) => paint.get(map(name)) ?? ''
  const style = structuredClone(positron) as StyleSpecification
  for (const layer of style.layers) {
    const p = (layer.paint ?? {}) as Record<string, unknown>
    if (layer.type === 'background') {
      p['background-color'] = colour('land')
    } else if (layer.type === 'fill') {
      const hit = FILL.find(([pattern]) => pattern.test(layer.id))
      if (hit) p['fill-color'] = colour(hit[1])
      if (layer.id === 'building') p['fill-outline-color'] = colour('runway')
    } else if (layer.type === 'line') {
      const hit = LINE.find(([pattern]) => pattern.test(layer.id))
      if (hit) p['line-color'] = colour(hit[1])
    } else if (layer.type === 'symbol') {
      const water = layer.id.includes('water')
      p['text-color'] = colour(water ? 'water-label' : 'label')
      p['text-halo-color'] = colour(water ? 'water' : 'land')
    }
    layer.paint = p as LayerSpecification['paint']
  }
  if (!network) return style

  style.sources['mylder-lines'] = { type: 'geojson', data: lineFeatures(paint, network) }
  style.sources['mylder-stops'] = { type: 'geojson', data: stopFeatures(network) }
  const firstLabel = style.layers.findIndex((layer) => layer.type === 'symbol')
  style.layers.splice(firstLabel, 0, ...networkLayers(paint))
  return style
}

function networkLayers(paint: Paint): LayerSpecification[] {
  const lines = RAIL.map(({ mode, layer }): LayerSpecification => ({
    id: layer,
    type: 'line',
    source: 'mylder-lines',
    filter: ['==', ['get', 'mode'], mode],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'colour'],
      'line-width': ['get', 'width'],
      'line-opacity': ['get', 'opacity'],
      'line-offset': ['get', 'offset'],
    },
  }))
  const stops = (
    id: string,
    rail: boolean,
    minzoom: number,
    radius: number,
  ): LayerSpecification => ({
    id,
    type: 'circle',
    source: 'mylder-stops',
    minzoom,
    filter: ['==', ['get', 'rail'], rail],
    paint: {
      'circle-radius': radius,
      'circle-color': paint.get(STOP_FILL) ?? '',
      'circle-stroke-color': paint.get(STOP_RING) ?? '',
      'circle-stroke-width': 1,
    },
  })
  // A bus stop shows only close in, where the streets it stands on can be told apart.
  return [...lines, stops('mylder-stops-bus', false, 14, 2), stops('mylder-stops-rail', true, 9, 3)]
}

/** The lines drawn at rest: every Metro, S-tog, train and light rail line with a pattern. */
function drawnLines(network: Network): LineRecord[] {
  const run = new Set(network.patterns.patterns.map((pattern) => pattern.line))
  return [...run].map((index) => network.patterns.lines[index]).filter((l) => l.mode !== 'bus')
}

/**
 * A straight step longer than this is a segment without a shape, such as line 083's stops in
 * Hamburg and Copenhagen joined by one line across the sea, not a track worth drawing.
 */
const UNSHAPED_STEP = 20_000

/**
 * A segment's points as the lines it is drawn in, [lon, lat], broken at every unshaped step.
 * Only the drawing leaves them out: vehicles still move along the whole path.
 */
function drawnPieces(points: readonly LatLon[]): [number, number][][] {
  const pieces: [number, number][][] = []
  let piece: [number, number][] = []
  points.forEach((point, i) => {
    if (i > 0 && distance(points[i - 1], point) > UNSHAPED_STEP) {
      if (piece.length > 1) pieces.push(piece)
      piece = []
    }
    piece.push([point[1], point[0]])
  })
  if (piece.length > 1) pieces.push(piece)
  return pieces
}

const decoded = new WeakMap<Network, Map<number, [number, number][][]>>()

/** A segment's drawn pieces, decoded once per network. */
function piecesOf(network: Network, segment: number): [number, number][][] {
  let found = decoded.get(network)
  if (!found) decoded.set(network, (found = new Map()))
  let pieces = found.get(segment)
  if (!pieces) found.set(segment, (pieces = drawnPieces(network.paths.points(segment))))
  return pieces
}

/**
 * Each line's path, one multi-line of its patterns' segments for each offset it is drawn at: its
 * strand on each stretch times its mode's track spacing, in px, to the right of the way it runs.
 */
function lineFeatures(paint: Paint, network: Network): FeatureCollection<MultiLineString> {
  const byLine = new Map<LineRecord, Map<number, [number, number][][]>>()
  for (const { line, segments, place } of strandsOf(network, strandsByToken(paint, network))) {
    const offset = offsetOf(paint, line, place)
    let offsets = byLine.get(line)
    if (!offsets) byLine.set(line, (offsets = new Map()))
    const pieces = offsets.get(offset) ?? []
    offsets.set(offset, pieces)
    for (const segment of segments) pieces.push(...piecesOf(network, segment))
  }
  const features: Feature<MultiLineString>[] = []
  for (const [line, offsets] of byLine) {
    const rail = RAIL.find(({ mode }) => mode === line.mode)!
    for (const [offset, coordinates] of offsets) {
      features.push({
        type: 'Feature',
        properties: {
          line: line.name,
          mode: line.mode,
          colour: paint.get(line.colour) || paint.get(modeColour(line.mode)),
          width: numberOf(paint, rail.width),
          opacity: numberOf(paint, rail.opacity),
          offset,
        },
        geometry: { type: 'MultiLineString', coordinates },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

function stopFeatures(network: Network): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: network.stops.stops.map((stop) => ({
      type: 'Feature',
      properties: { name: stop.name, rail: stop.modes.some((mode) => mode !== 'bus') },
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
    })),
  }
}
