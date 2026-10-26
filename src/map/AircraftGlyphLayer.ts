// The aircraft's deck.gl layers (docs/aircraft.md, "The glyph"), drawn above the vehicles in the
// same overlay: until Perron has the plane glyph (#134), the stand-in is the vehicle dot in a
// neutral colour, on the same land-coloured halo, with a short tick pointing along the track.
// Every aircraft is drawn solid where the last answer put it; its data state and its motion
// between answers come with #129. WebGL is not tested in jsdom.
import 'client-only'
import type { Layer } from '@deck.gl/core'
import { IconLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { AircraftSnapshot, SnapshotAircraft } from '../tracker/aircraft/index.ts'
import { parseColour, type RGBA } from './glyphs.ts'
import { numberOf, type Paint } from './paint.ts'
import type { DrawnKind, Project } from './picking.ts'

/** The layer whose dots a pick finds. */
export const AIRCRAFT_LAYER = 'aircraft'

const COLOUR = 'perron-color-text-secondary'
const RADIUS = 'perron-map-dot-radius-regional'
const HALO = 'perron-vehicle-dot-halo'
const HALO_COLOUR = 'perron-color-data-state-halo'

/** Every token the aircraft read, for `readPaint`. */
export const aircraftPaint = (): string[] => [COLOUR, RADIUS, HALO, HALO_COLOUR]

/** The aircraft as the canvas draws them, in the paint read when they landed. */
export interface DrawnAircraft {
  readonly aircraft: readonly SnapshotAircraft[]
  /** Those with a track, which their tick points along. */
  readonly heading: readonly SnapshotAircraft[]
  readonly colour: RGBA
  readonly radius: number
  readonly halo: { readonly width: number; readonly colour: RGBA }
}

const INK: RGBA = [0, 0, 0, 255]

/** The aircraft of a snapshot, in the paint read now. */
export function aircraftOf(snapshot: AircraftSnapshot, paint: Paint): DrawnAircraft {
  const colour = (token: string) => parseColour(paint.get(token) ?? '') ?? INK
  return {
    aircraft: snapshot.aircraft,
    heading: snapshot.aircraft.filter((each) => each.track !== undefined),
    colour: colour(COLOUR),
    radius: numberOf(paint, RADIUS),
    halo: { width: numberOf(paint, HALO), colour: colour(HALO_COLOUR) },
  }
}

/** The tick, pointing north from the dot's edge: deck.gl tints it, and turns it to the track. */
const TICK_SIZE = 32
const TICK = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TICK_SIZE}" height="${TICK_SIZE}">` +
    '<path d="M16 2v7" stroke="#000" stroke-width="2.5" stroke-linecap="round"/></svg>',
)}`
const TICK_MAPPING = {
  tick: { x: 0, y: 0, width: TICK_SIZE, height: TICK_SIZE, anchorY: TICK_SIZE / 2, mask: true },
}

const positionOf = (aircraft: SnapshotAircraft): [number, number] => [aircraft.lon, aircraft.lat]

/** The layers that draw the aircraft, each dot `radiusScale` times Perron's size. */
export function aircraftLayers(drawn: DrawnAircraft, radiusScale: number): Layer[] {
  return [
    new ScatterplotLayer<SnapshotAircraft>({
      id: 'aircraft-halos',
      data: drawn.aircraft,
      getPosition: positionOf,
      radiusUnits: 'pixels',
      radiusScale,
      getRadius: drawn.radius + drawn.halo.width,
      getFillColor: [...drawn.halo.colour],
      pickable: false,
    }),
    new IconLayer<SnapshotAircraft>({
      id: 'aircraft-ticks',
      data: drawn.heading,
      iconAtlas: TICK,
      iconMapping: TICK_MAPPING,
      getIcon: () => 'tick',
      getPosition: positionOf,
      sizeUnits: 'pixels',
      sizeScale: radiusScale,
      getSize: TICK_SIZE,
      // deck.gl turns an icon anticlockwise; a track runs clockwise from north.
      getAngle: (aircraft) => -(aircraft.track ?? 0),
      getColor: [...drawn.colour],
      pickable: false,
    }),
    new ScatterplotLayer<SnapshotAircraft>({
      id: AIRCRAFT_LAYER,
      data: drawn.aircraft,
      getPosition: positionOf,
      radiusUnits: 'pixels',
      radiusScale,
      getRadius: drawn.radius,
      getFillColor: [...drawn.colour],
      // deck.gl picks within the overlay's picking radius of the pointer (picking.ts).
      pickable: true,
    }),
  ]
}

const aircraftKinds = new WeakMap<DrawnAircraft, DrawnKind>()

/** The aircraft as a drawn kind, the same one for each set of aircraft. */
export function aircraftDrawn(drawn: DrawnAircraft): DrawnKind {
  let kind = aircraftKinds.get(drawn)
  if (!kind) {
    const keys = drawn.aircraft.map((each) => each.hex)
    kind = {
      kind: 'aircraft',
      keys,
      picks: AIRCRAFT_LAYER,
      at: (i: number, project: Project) => {
        const { x, y } = project(positionOf(drawn.aircraft[i]))
        return [x, y]
      },
      layers: (radiusScale) => aircraftLayers(drawn, radiusScale),
    }
    aircraftKinds.set(drawn, kind)
  }
  return kind
}
