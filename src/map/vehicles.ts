// The vehicles as the canvas draws them: each trip of the snapshot that isn't cancelled, in its
// line's colour and its data state's glyph, laid out as one typed array per attribute so deck.gl
// takes them without copying (docs/screens.md, "The moving map"; docs/data-states.md, "Which
// trips are on the map"). Positions and opacities are their own arrays, which the motion loop
// writes into each frame (loop.ts); the glyphs change only with a snapshot, a data state or a
// theme.
import 'client-only'
import type { DataState } from '../domain/data-state.ts'
import type { Mode } from '../timetable/format.ts'
import type { Network } from '../timetable/network.ts'
import type { Snapshot, SnapshotTrip } from '../tracker/index.ts'
import { glyphOf, lookOf, parseColour, vehicleTokens, type RGBA } from './glyphs.ts'
import { modeColour, type Paint } from './paint.ts'
import type { MapView } from './view.ts'

const SHOW_ALL: Pick<MapView, 'hidden'> = { hidden: new Set() }

export interface Vehicles {
  readonly length: number
  /** The trip each vehicle is, in drawing order. */
  readonly trips: readonly SnapshotTrip[]
  /** The same trips by their keys. */
  readonly keys: readonly string[]
  /** Longitude and latitude, two per vehicle. */
  readonly positions: Float64Array
  /** How opaque each vehicle is drawn, 0 to 1: under 1 only while it fades to a far new place. */
  readonly opacity: Float32Array
  readonly radius: Float32Array
  readonly lineWidth: Float32Array
  /** Red, green, blue and alpha, four per vehicle. */
  readonly fill: Uint8ClampedArray
  readonly line: Uint8ClampedArray
  /** Dash and gap in stroke widths, two per vehicle; 0 and 0 for a solid stroke. */
  readonly dash: Float32Array
  readonly cut: Float32Array
  /** The land-coloured disc under each vehicle. */
  readonly haloRadius: Float32Array
  readonly haloColour: RGBA
}

/** Every token the vehicles read, for `readPaint`: the glyphs' and each line's colour. */
export function vehiclePaint(network?: Network): string[] {
  return [
    ...vehicleTokens(),
    modeColour('bus'),
    modeColour('train'),
    ...(network?.patterns.lines.map((line) => line.colour) ?? []),
  ]
}

const INK: RGBA = [0, 0, 0, 255]

/**
 * Whether a trip is on the map with the filters `hidden`: not cancelled, and in a mode the
 * filters show. The canvas draws these, and every count of the trips on the map counts these.
 */
export const onMap = (trip: SnapshotTrip, hidden: ReadonlySet<Mode>): boolean =>
  !trip.cancelled && !hidden.has(trip.mode)

/**
 * The vehicles of a snapshot, on its timetable's network once that has loaded, in the paint
 * read now. Until then, and for a line Perron has no colour for, a vehicle takes its mode's.
 * Each takes its data state from `states`, the states by the clock, else the snapshot's own.
 * A mode the viewer's filter hides is left out: a filter changes what is drawn, never the data.
 */
export function vehiclesOf(
  snapshot: Snapshot,
  network: Network | undefined,
  paint: Paint,
  states?: ReadonlyMap<string, DataState>,
  filter: Pick<MapView, 'hidden'> = SHOW_ALL,
): Vehicles {
  const look = lookOf(paint)
  const colours = new Map<string, RGBA>()
  const colour = (token: string) => {
    let found = colours.get(token)
    if (!found) colours.set(token, (found = parseColour(paint.get(token) ?? '') ?? INK))
    return found
  }
  const colourOf = (trip: SnapshotTrip) => {
    const pattern = network?.patterns.patterns[trip.pattern]
    const line = pattern && network.patterns.lines[pattern.line]
    const own = line && paint.get(line.colour)
    return own ? colour(line.colour) : colour(modeColour(trip.mode))
  }

  const drawn = snapshot.trips.filter((trip) => onMap(trip, filter.hidden))
  const n = drawn.length
  const vehicles = {
    length: n,
    trips: drawn,
    keys: drawn.map((trip) => trip.key),
    positions: new Float64Array(n * 2),
    opacity: new Float32Array(n).fill(1),
    radius: new Float32Array(n),
    lineWidth: new Float32Array(n),
    fill: new Uint8ClampedArray(n * 4),
    line: new Uint8ClampedArray(n * 4),
    dash: new Float32Array(n * 2),
    cut: new Float32Array(n),
    haloRadius: new Float32Array(n),
    haloColour: look.halo.colour,
  }
  drawn.forEach((trip, i) => {
    // A Waiting trip's position is its first stop, where the snapshot stands it.
    const [lat, lon] = trip.position
    vehicles.positions.set([lon, lat], i * 2)
    const state = states?.get(trip.key) ?? trip.state
    const glyph = glyphOf(state, trip.mode, colourOf(trip), look)
    vehicles.radius[i] = glyph.radius
    vehicles.lineWidth[i] = glyph.lineWidth
    vehicles.fill.set(glyph.fill, i * 4)
    vehicles.line.set(glyph.line, i * 4)
    vehicles.dash.set(glyph.dash, i * 2)
    vehicles.cut[i] = glyph.cut
    vehicles.haloRadius[i] = look.radius[trip.mode] + look.halo.width
  })
  return vehicles
}
