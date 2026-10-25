// OpenFreeMap's Positron, recoloured from Perron's color.map.* tokens, plus the rail lines.
// Positron's layers, filters, widths and zoom ranges stay; only colours change, so the light
// and the dark theme are the same map in different paint.
import type { StyleSpecification, LayerSpecification } from 'maplibre-gl'
import { tokens, lineColour, lineWidth, trackSpacing, opacity, type Theme } from './perron'
import type { Line } from './sim'

type MapToken =
  | 'color.map.water'
  | 'color.map.land'
  | 'color.map.park'
  | 'color.map.street'
  | 'color.map.airport'
  | 'color.map.runway'
  | 'color.map.building'
  | 'color.map.rail'
  | 'color.map.label'
  | 'color.map.water-label'

// Which token paints which Positron layer. Casings, boundaries and the gaps in dashed rail have
// no token of their own: casings and building outlines take `runway` (the mid neutral between
// land and rail), boundaries take `rail`, dash gaps take `land`.
const FILL: Array<[RegExp, MapToken]> = [
  [/^background$/, 'color.map.land'],
  [/^(park|landcover_wood)$/, 'color.map.park'],
  [/^water$/, 'color.map.water'],
  [
    /^(landcover_ice_shelf|landcover_glacier|landuse_residential|road_area_pier)$/,
    'color.map.land',
  ],
  [/^building$/, 'color.map.building'],
  [/^aeroway-area$/, 'color.map.airport'],
]
const LINE: Array<[RegExp, MapToken]> = [
  [/^road_pier$/, 'color.map.land'],
  [/^waterway$/, 'color.map.water'],
  [/_casing$/, 'color.map.runway'],
  [
    /^(tunnel_motorway_inner|highway_path|highway_minor|highway_major_inner|highway_major_subtle)$/,
    'color.map.street',
  ],
  [
    /^(highway_motorway_inner|highway_motorway_subtle|highway_motorway_bridge_inner)$/,
    'color.map.street',
  ],
  [/^(aeroway-taxiway|aeroway-runway)$/, 'color.map.runway'],
  [/_dashline$/, 'color.map.land'],
  [/^railway/, 'color.map.rail'],
  [/^boundary/, 'color.map.rail'],
]

export function buildStyle(
  positron: StyleSpecification,
  theme: Theme,
  lines: Line[],
): StyleSpecification {
  const t = tokens(theme)
  const style: StyleSpecification = JSON.parse(JSON.stringify(positron))
  // The Natural Earth raster only matters below zoom 6.
  delete style.sources.ne2_shaded
  style.layers = style.layers.filter((l) => !('source' in l && l.source === 'ne2_shaded'))

  for (const layer of style.layers) {
    const paint = (layer.paint ?? {}) as Record<string, unknown>
    if (layer.type === 'background') {
      paint['background-color'] = t['color.map.land']
    } else if (layer.type === 'fill') {
      const hit = FILL.find(([re]) => re.test(layer.id))
      if (hit) paint['fill-color'] = t[hit[1]]
      if (layer.id === 'building') paint['fill-outline-color'] = t['color.map.runway']
    } else if (layer.type === 'line') {
      const hit = LINE.find(([re]) => re.test(layer.id))
      if (hit) paint['line-color'] = t[hit[1]]
    } else if (layer.type === 'symbol') {
      const water = /water/.test(layer.id)
      paint['text-color'] = water ? t['color.map.water-label'] : t['color.map.label']
      paint['text-halo-color'] = water ? t['color.map.water'] : t['color.map.land']
    }
    layer.paint = paint as LayerSpecification['paint']
  }

  // Rail lines as static layers under the labels, coloured per line, offset where they share track.
  const features = lines
    .filter((l) => l.mode !== 'bus')
    .map((l) => {
      const coords: [number, number][] = []
      for (let i = 0; i < l.n; i++) coords.push([l.lonlat[i * 2], l.lonlat[i * 2 + 1]])
      return {
        type: 'Feature' as const,
        properties: {
          id: l.id,
          colour: lineColour(l.id, l.mode, theme),
          width: lineWidth[l.mode as 'metro' | 'stog' | 'regional'],
          offset: (TRACK_OFFSET[l.id] ?? 0) * trackSpacing[l.mode as 'metro' | 'stog' | 'regional'],
          opacity: l.mode === 'regional' ? opacity.lineRegional : opacity.line,
        },
        geometry: { type: 'LineString' as const, coordinates: coords },
      }
    })
  style.sources['mylder-lines'] = { type: 'geojson', data: { type: 'FeatureCollection', features } }
  const firstSymbol = style.layers.findIndex((l) => l.type === 'symbol')
  style.layers.splice(firstSymbol, 0, {
    id: 'mylder-lines',
    type: 'line',
    source: 'mylder-lines',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'colour'],
      'line-width': ['get', 'width'],
      'line-offset': ['get', 'offset'],
      'line-opacity': ['get', 'opacity'],
    },
  })
  return style
}

// Strand offsets for lines that share a track, copied from the design prototype's `off` values.
const TRACK_OFFSET: Record<string, number> = {
  M1: -0.5,
  M2: 0.5,
  M3: -0.5,
  M4: -0.5,
  A: -2,
  B: -1,
  C: 0,
  E: 1,
  H: 2,
  F: 0,
  Ø: -3,
  RE: 3,
}
