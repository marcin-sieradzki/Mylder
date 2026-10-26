// The vehicles as the canvas draws them: each trip of the snapshot that isn't cancelled, in its
// line's colour and its data state's glyph, laid out as one typed array per attribute so deck.gl
// takes them without copying (docs/screens.md, "The moving map"; docs/data-states.md, "Which
// trips are on the map"). Positions are their own array, which the motion loop can write into
// each frame; the glyphs change only with a snapshot or a theme.
import 'client-only'
import type { Network } from '../timetable/network.ts'
import type { Snapshot, SnapshotTrip } from '../tracker/index.ts'
import { glyphOf, lookOf, parseColour, vehicleTokens, type RGBA } from './glyphs.ts'
import { modeColour, type Paint } from './paint.ts'
import type { MapView } from './view.ts'

const SHOW_ALL: Pick<MapView, 'hidden'> = { hidden: new Set() }

export interface Vehicles {
  readonly length: number
  /** The trip each vehicle is, by its key, in drawing order. */
  readonly keys: readonly string[]
  /** Longitude and latitude, two per vehicle. */
  readonly positions: Float64Array
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
 * The vehicles of a snapshot, on its timetable's network once that has loaded, in the paint
 * read now. Until then, and for a line Perron has no colour for, a vehicle takes its mode's.
 * A mode the viewer's filter hides is left out: a filter changes what is drawn, never the data.
 */
export function vehiclesOf(
  snapshot: Snapshot,
  network: Network | undefined,
  paint: Paint,
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

  const drawn = snapshot.trips.filter((trip) => !trip.cancelled && !filter.hidden.has(trip.mode))
  const n = drawn.length
  const vehicles = {
    length: n,
    keys: drawn.map((trip) => trip.key),
    positions: new Float64Array(n * 2),
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
    const glyph = glyphOf(trip.state, trip.mode, colourOf(trip), look)
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
