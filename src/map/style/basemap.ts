// The basemap's style: the forked Positron (positron.json, licence beside it) on OpenFreeMap's
// tiles, repainted from Perron's map tokens, with the timetable's line paths and stops drawn
// under the place names (docs/screens.md, "The moving map"; ADR 0003), and the map's highlight
// over them, with everything outside it dimmed (Perron's map foundation, "Focus and dimming").
// Positron's layers, filters, widths and zooms stay; only the paint changes, so light and dark
// are one map.
import 'client-only'
import type { Feature, FeatureCollection, MultiLineString, Point } from 'geojson'
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { distance } from '../../domain/trip-motion.ts'
import type { LineRecord, Mode } from '../../timetable/format.ts'
import type { Network } from '../../timetable/network.ts'
import type { LatLon } from '../../timetable/polyline.ts'
import type { Highlight } from '../highlight.ts'
import { modeColour, numberOf, type Paint } from '../paint.ts'
import positron from './positron.json'

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

/** The rail modes, bottom to top: each drawn at its mode's width and opacity. */
const RAIL: readonly { mode: Mode; layer: string; width: string; opacity: string }[] = [
  {
    mode: 'train',
    layer: 'mylder-lines-train',
    width: 'perron-map-line-width-regional',
    opacity: 'perron-opacity-map-line-regional',
  },
  {
    mode: 'light-rail',
    layer: 'mylder-lines-light-rail',
    width: 'perron-map-line-width-regional',
    opacity: 'perron-opacity-map-line-regional',
  },
  {
    mode: 's-tog',
    layer: 'mylder-lines-s-tog',
    width: 'perron-map-line-width-stog',
    opacity: 'perron-opacity-map-line',
  },
  {
    mode: 'metro',
    layer: 'mylder-lines-metro',
    width: 'perron-map-line-width-metro',
    opacity: 'perron-opacity-map-line',
  },
]

const STOP_FILL = map('land')
const STOP_RING = map('label')

/** How much wider a line in focus is drawn than at rest; a bus route has a width of its own. */
const FOCUS_EXTRA = 'perron-map-line-width-focus-extra'
const BUS_FOCUS = 'perron-map-line-width-bus-focus'
/** How opaque the lines and stations outside the focus are drawn. */
const DIM_LINE = 'perron-opacity-map-dim-line'
const DIM_STATION = 'perron-opacity-map-dim-station'

/**
 * Every token the style reads, for `readPaint`: the map's colours, the line widths and
 * opacities, and the colour of each line the network draws.
 */
export function paintTokens(network?: Network, highlight?: Highlight): string[] {
  const lines = network ? drawnLines(network).map(({ line }) => line.colour) : []
  const focused = highlight
    ? [...highlight.lines.map((line) => line.colour), ...highlight.stops.map((stop) => stop.colour)]
    : []
  return [
    ...FILL.map(([, colour]) => map(colour)),
    ...LINE.map(([, colour]) => map(colour)),
    map('label'),
    map('water-label'),
    ...RAIL.flatMap(({ width, opacity }) => [width, opacity]),
    modeColour('bus'),
    modeColour('train'),
    ...lines,
    FOCUS_EXTRA,
    BUS_FOCUS,
    DIM_LINE,
    DIM_STATION,
    ...focused,
  ]
}

/**
 * The style for the paint read now, with the network's lines and stops once it has loaded, and
 * what is highlighted over them.
 */
export function basemapStyle(
  paint: Paint,
  network?: Network,
  highlight?: Highlight,
): StyleSpecification {
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

  const dimmed = highlight !== undefined
  style.sources['mylder-lines'] = { type: 'geojson', data: lineFeatures(paint, network, dimmed) }
  style.sources['mylder-stops'] = { type: 'geojson', data: stopFeatures(network) }
  const focus = highlightFeatures(paint, highlight)
  style.sources[HIGHLIGHT_LINES] = { type: 'geojson', data: focus.lines }
  style.sources[HIGHLIGHT_STOPS] = { type: 'geojson', data: focus.stops }
  const firstLabel = style.layers.findIndex((layer) => layer.type === 'symbol')
  style.layers.splice(firstLabel, 0, ...networkLayers(paint, dimmed), ...highlightLayers(paint))
  return style
}

const HIGHLIGHT_LINES = 'mylder-highlight-lines'
const HIGHLIGHT_STOPS = 'mylder-highlight-stops'

const BUS_STOPS = 'mylder-stops-bus'
const RAIL_STOPS = 'mylder-stops-rail'

/** The layers the stops are drawn in, whose features carry each stop's `id`, for a tap to open. */
export const STOP_LAYERS: readonly string[] = [RAIL_STOPS, BUS_STOPS]

function networkLayers(paint: Paint, dimmed: boolean): LayerSpecification[] {
  const stationOpacity = dimmed ? numberOf(paint, DIM_STATION) : 1
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
      'circle-opacity': stationOpacity,
      'circle-stroke-opacity': stationOpacity,
    },
  })
  // A bus stop shows only close in, where the streets it stands on can be told apart.
  return [...lines, stops(BUS_STOPS, false, 14, 2), stops(RAIL_STOPS, true, 9, 3)]
}

/** The lines drawn at rest: every Metro, S-tog, train and light rail line with a pattern. */
function drawnLines(network: Network) {
  const segments = new Map<number, Set<number>>()
  for (const pattern of network.patterns.patterns) {
    let line = segments.get(pattern.line)
    if (!line) segments.set(pattern.line, (line = new Set()))
    for (const segment of pattern.segments) line.add(segment)
  }
  return [...segments]
    .map(([index, lineSegments]) => ({ line: network.patterns.lines[index], lineSegments }))
    .filter(({ line }) => line.mode !== 'bus')
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

const geometries = new WeakMap<Network, Map<LineRecord, MultiLineString>>()

/** Each line's path as one multi-line of its patterns' segments, decoded once per network. */
function lineGeometries(network: Network): Map<LineRecord, MultiLineString> {
  let found = geometries.get(network)
  if (!found) {
    found = new Map(
      drawnLines(network).map(({ line, lineSegments }) => [
        line,
        {
          type: 'MultiLineString',
          coordinates: [...lineSegments].flatMap((segment) =>
            drawnPieces(network.paths.points(segment)),
          ),
        },
      ]),
    )
    geometries.set(network, found)
  }
  return found
}

function lineFeatures(
  paint: Paint,
  network: Network,
  dimmed: boolean,
): FeatureCollection<MultiLineString> {
  const features: Feature<MultiLineString>[] = []
  for (const [line, geometry] of lineGeometries(network)) {
    const rail = RAIL.find(({ mode }) => mode === line.mode)!
    features.push({
      type: 'Feature',
      properties: {
        line: line.name,
        mode: line.mode,
        colour: paint.get(line.colour) || paint.get(modeColour(line.mode)),
        width: numberOf(paint, rail.width),
        opacity: numberOf(paint, dimmed ? DIM_LINE : rail.opacity),
      },
      geometry,
    })
  }
  return { type: 'FeatureCollection', features }
}

function stopFeatures(network: Network): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: network.stops.stops.map((stop) => ({
      type: 'Feature',
      properties: {
        id: stop.id,
        name: stop.name,
        rail: stop.modes.some((mode) => mode !== 'bus'),
      },
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
    })),
  }
}

/** The width a mode's line is drawn at in focus: its width at rest and the focus's more. */
function focusWidth(paint: Paint, mode: Mode): number {
  const rail = RAIL.find((each) => each.mode === mode)
  const width = rail
    ? numberOf(paint, rail.width) + numberOf(paint, FOCUS_EXTRA)
    : numberOf(paint, BUS_FOCUS)
  // To a tenth of a pixel, past the sum's rounding.
  return Math.round(width * 10) / 10
}

/** The highlight's lines and stops, in their colours, or nothing while the map is normal. */
function highlightFeatures(paint: Paint, highlight: Highlight | undefined) {
  const colour = (token: string, mode: Mode) => paint.get(token) || paint.get(modeColour(mode))
  const lines: Feature<MultiLineString>[] = (highlight?.lines ?? []).map((line) => ({
    type: 'Feature',
    properties: { colour: colour(line.colour, line.mode), width: focusWidth(paint, line.mode) },
    geometry: { type: 'MultiLineString', coordinates: drawnPieces(line.points) },
  }))
  const stops: Feature<Point>[] = (highlight?.stops ?? []).map((stop) => ({
    type: 'Feature',
    properties: { colour: paint.get(stop.colour) ?? '' },
    geometry: { type: 'Point', coordinates: [stop.point[1], stop.point[0]] },
  }))
  return {
    lines: { type: 'FeatureCollection', features: lines } satisfies FeatureCollection,
    stops: { type: 'FeatureCollection', features: stops } satisfies FeatureCollection,
  }
}

/** The highlight's line over the dimmed network, and its stops ringed in its colour over that. */
function highlightLayers(paint: Paint): LayerSpecification[] {
  return [
    {
      id: HIGHLIGHT_LINES,
      type: 'line',
      source: HIGHLIGHT_LINES,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'colour'], 'line-width': ['get', 'width'] },
    },
    {
      id: HIGHLIGHT_STOPS,
      type: 'circle',
      source: HIGHLIGHT_STOPS,
      paint: {
        'circle-radius': 3,
        'circle-color': paint.get(STOP_FILL) ?? '',
        'circle-stroke-color': ['get', 'colour'],
        'circle-stroke-width': 2,
      },
    },
  ]
}
