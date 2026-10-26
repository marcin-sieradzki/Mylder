// The aircraft as the canvas draws them (docs/aircraft.md, "The browser"), above the vehicles in
// the same overlay: until Perron has the plane glyph (#134), the stand-in is the vehicle dot in a
// neutral colour, styled by its data state as a vehicle's is (glyphs.ts), on the same
// land-coloured halo, with a short tick pointing along its track; an aircraft on the ground is the
// size of a bus's dot. Laid out as one typed array per attribute, as the vehicles are: the
// positions are their own array, which the aircraft's motion writes into each frame
// (aircraft-loop.ts); the glyphs change only with a snapshot, a data state or a theme. WebGL is
// not tested in jsdom.
import 'client-only'
import type { Layer } from '@deck.gl/core'
import { IconLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { AircraftState } from '../domain/aircraft-state.ts'
import type { AircraftSnapshot, SnapshotAircraft } from '../tracker/aircraft/index.ts'
import type { AircraftStates } from './aircraft-states.ts'
import { lookOf, parseColour, sizedGlyph, vehicleTokens, type RGBA } from './glyphs.ts'
import { numberOf, type Paint } from './paint.ts'
import type { DrawnKind, Project } from './picking.ts'
import { VehicleGlyphLayer } from './VehicleGlyphLayer.ts'

/** The layer whose dots a pick finds. */
export const AIRCRAFT_LAYER = 'aircraft'

const COLOUR = 'perron-color-text-secondary'
const RADIUS = 'perron-map-dot-radius-regional'
/** On the ground, smaller: the size of a bus's dot. */
const GROUND_RADIUS = 'perron-map-dot-radius-bus'

/** Every token the aircraft read, for `readPaint`. */
export const aircraftPaint = (): string[] => [...vehicleTokens(), COLOUR, RADIUS, GROUND_RADIUS]

/** The aircraft on the map as the canvas draws them, in the paint read when they landed. */
export interface DrawnAircraft {
  readonly length: number
  /** Each aircraft drawn, in drawing order. */
  readonly aircraft: readonly SnapshotAircraft[]
  /** The same aircraft by their hexes. */
  readonly keys: readonly string[]
  /** Each one's data state now. */
  readonly states: readonly AircraftState[]
  /** Longitude and latitude, two per aircraft. */
  readonly positions: Float64Array
  readonly radius: Float32Array
  readonly lineWidth: Float32Array
  /** Red, green, blue and alpha, four per aircraft. */
  readonly fill: Uint8ClampedArray
  readonly line: Uint8ClampedArray
  readonly cut: Float32Array
  /** The land-coloured disc under each aircraft. */
  readonly haloRadius: Float32Array
  readonly haloColour: RGBA
  /** Each tick's turn from north, anticlockwise as deck.gl turns an icon, and its size: 0 for none. */
  readonly tickAngle: Float32Array
  readonly tickSize: Float32Array
}

const INK: RGBA = [0, 0, 0, 255]

/** The tick, pointing north from the dot's edge: deck.gl tints it, and turns it to the track. */
const TICK_SIZE = 32
const TICK = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TICK_SIZE}" height="${TICK_SIZE}">` +
    '<path d="M16 2v7" stroke="#000" stroke-width="2.5" stroke-linecap="round"/></svg>',
)}`
const TICK_MAPPING = {
  tick: { x: 0, y: 0, width: TICK_SIZE, height: TICK_SIZE, anchorY: TICK_SIZE / 2, mask: true },
}

/** What of the drawn aircraft their states and the paint decide: all but where they are. */
type Glyphs = Omit<DrawnAircraft, 'length' | 'aircraft' | 'keys' | 'positions'>

/** The glyphs of `aircraft`, each in its state from `states`, in `paint`. */
function glyphsOf(
  aircraft: readonly SnapshotAircraft[],
  states: readonly AircraftState[],
  paint: Paint,
): Glyphs {
  const look = lookOf(paint)
  const colour = parseColour(paint.get(COLOUR) ?? '') ?? INK
  const airborne = numberOf(paint, RADIUS)
  const grounded = numberOf(paint, GROUND_RADIUS)
  const n = aircraft.length
  const glyphs = {
    states,
    radius: new Float32Array(n),
    lineWidth: new Float32Array(n),
    fill: new Uint8ClampedArray(n * 4),
    line: new Uint8ClampedArray(n * 4),
    cut: new Float32Array(n),
    haloRadius: new Float32Array(n),
    haloColour: look.halo.colour,
    tickAngle: new Float32Array(n),
    tickSize: new Float32Array(n),
  }
  aircraft.forEach((each, i) => {
    const r = each.altitude === 'ground' ? grounded : airborne
    const glyph = sizedGlyph(states[i], r, colour, look)
    glyphs.radius[i] = glyph.radius
    glyphs.lineWidth[i] = glyph.lineWidth
    glyphs.fill.set(glyph.fill, i * 4)
    glyphs.line.set(glyph.line, i * 4)
    glyphs.cut[i] = glyph.cut
    glyphs.haloRadius[i] = r + look.halo.width
    // deck.gl turns an icon anticlockwise; a track runs clockwise from north.
    glyphs.tickAngle[i] = -(each.track ?? 0)
    glyphs.tickSize[i] = each.track === undefined ? 0 : (TICK_SIZE * r) / airborne
  })
  return glyphs
}

/**
 * The aircraft of a snapshot on the map, each in its state from `states`, the states by the
 * clock, in the paint read now. An aircraft `states` leaves out has been dropped and isn't drawn.
 * Each stands at its fix until its motion moves it.
 */
export function aircraftOf(
  snapshot: AircraftSnapshot,
  paint: Paint,
  states: AircraftStates,
): DrawnAircraft {
  const drawn = snapshot.aircraft.filter((each) => states.has(each.hex))
  const positions = new Float64Array(drawn.length * 2)
  drawn.forEach((each, i) => positions.set([each.lon, each.lat], i * 2))
  return {
    length: drawn.length,
    aircraft: drawn,
    keys: drawn.map((each) => each.hex),
    positions,
    ...glyphsOf(
      drawn,
      drawn.map((each) => states.get(each.hex)!),
      paint,
    ),
  }
}

/**
 * The aircraft `drawn` in their `states` now, in `paint`: only their glyphs made again, their
 * positions the same, which their motion goes on writing into. None when `states` has dropped
 * one of them, which changes what is drawn.
 */
export function restyled(
  drawn: DrawnAircraft,
  paint: Paint,
  states: AircraftStates,
): DrawnAircraft | undefined {
  if (states.size !== drawn.length || !drawn.keys.every((hex) => states.has(hex))) return undefined
  return {
    ...drawn,
    ...glyphsOf(
      drawn.aircraft,
      drawn.keys.map((hex) => states.get(hex)!),
      paint,
    ),
  }
}

/**
 * Each set of aircraft's glyph attributes as deck.gl takes them, made once, so a frame or a zoom
 * uploads only the positions.
 */
const binary = new WeakMap<DrawnAircraft, ReturnType<typeof attributesOf>>()

function attributesOf(drawn: DrawnAircraft) {
  return {
    haloColour: [...drawn.haloColour] as [number, number, number, number],
    halos: { getRadius: { value: drawn.haloRadius, size: 1 } },
    ticks: {
      getAngle: { value: drawn.tickAngle, size: 1 },
      getSize: { value: drawn.tickSize, size: 1 },
      getColor: { value: drawn.line, size: 4 },
    },
    glyphs: {
      getRadius: { value: drawn.radius, size: 1 },
      getLineWidth: { value: drawn.lineWidth, size: 1 },
      getFillColor: { value: drawn.fill, size: 4 },
      getLineColor: { value: drawn.line, size: 4 },
      getCut: { value: drawn.cut, size: 1 },
    },
  }
}

/**
 * The layers that draw the aircraft where their positions are now, each dot `radiusScale` times
 * Perron's size. deck.gl uploads an attribute again only when it is handed a new one, so the
 * positions are new on every call.
 */
export function aircraftLayers(drawn: DrawnAircraft, radiusScale: number): Layer[] {
  let data = binary.get(drawn)
  if (!data) binary.set(drawn, (data = attributesOf(drawn)))
  const { length } = drawn
  const moving = { getPosition: { value: drawn.positions, size: 2 } }
  return [
    new ScatterplotLayer({
      id: 'aircraft-halos',
      data: { length, attributes: { ...data.halos, ...moving } },
      radiusUnits: 'pixels',
      radiusScale,
      getFillColor: data.haloColour,
      pickable: false,
    }),
    new IconLayer({
      id: 'aircraft-ticks',
      data: { length, attributes: { ...data.ticks, ...moving } },
      iconAtlas: TICK,
      iconMapping: TICK_MAPPING,
      getIcon: () => 'tick',
      sizeUnits: 'pixels',
      sizeScale: radiusScale,
      pickable: false,
    }),
    new VehicleGlyphLayer({
      id: AIRCRAFT_LAYER,
      data: { length, attributes: { ...data.glyphs, ...moving } },
      radiusUnits: 'pixels',
      radiusScale,
      lineWidthUnits: 'pixels',
      filled: true,
      stroked: true,
      antialiasing: true,
      // deck.gl picks within the overlay's picking radius of the pointer (picking.ts).
      pickable: true,
    }),
  ]
}

/** Where the `i`th aircraft is drawn in the canvas. */
const drawnAt = (drawn: DrawnAircraft, i: number, project: Project): [number, number] => {
  const { x, y } = project([drawn.positions[i * 2], drawn.positions[i * 2 + 1]])
  return [x, y]
}

const aircraftKinds = new WeakMap<DrawnAircraft, DrawnKind>()

/** The aircraft as a drawn kind, the same one for each set of aircraft. */
export function aircraftDrawn(drawn: DrawnAircraft): DrawnKind {
  let kind = aircraftKinds.get(drawn)
  if (!kind) {
    kind = {
      kind: 'aircraft',
      keys: drawn.keys,
      picks: AIRCRAFT_LAYER,
      at: (i, project) => drawnAt(drawn, i, project),
      layers: (radiusScale) => aircraftLayers(drawn, radiusScale),
    }
    aircraftKinds.set(drawn, kind)
  }
  return kind
}
