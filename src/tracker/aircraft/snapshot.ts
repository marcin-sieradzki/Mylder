// The aircraft snapshot (docs/aircraft.md, "The snapshot"): every aircraft in the transit box as
// the feed's latest answer placed it, the same bytes for every viewer, beside the transit
// snapshot and on its own rhythm (ADR 0014). Codes and numbers only, in the feed's units, which
// the browser converts. Defined once here as a schema; the browser imports its types only.
import 'server-only'
import { Schema } from 'effect'

const optional = Schema.optionalKey

/**
 * How the position was found: broadcast by the aircraft itself (ADS-B, ADS-R or ADS-C), worked
 * out by multilateration on the ground, relayed as TIS-B, or any other way.
 */
export const PositionSource = Schema.Literals(['broadcast', 'multilateration', 'tisb', 'other'])

/** Where the aircraft come from: adsb.lol, its fallback adsb.fi (#132), or a recording. */
export const AircraftProvider = Schema.Literals(['adsb.lol', 'adsb.fi', 'recording'])

/** One aircraft, by its ICAO hex. */
export const SnapshotAircraft = Schema.Struct({
  hex: Schema.String,
  callsign: optional(Schema.String),
  /** The type code, such as `A20N`. */
  type: optional(Schema.String),
  lat: Schema.Number,
  lon: Schema.Number,
  /** Barometric altitude in feet, or on the ground. */
  altitude: optional(Schema.Union([Schema.Number, Schema.Literal('ground')])),
  /** Ground speed in knots. */
  speed: optional(Schema.Number),
  /** Degrees clockwise from true north. */
  track: optional(Schema.Number),
  /** How old the position is at `fetched`, in seconds. */
  age: Schema.Number,
  source: PositionSource,
})

export const AircraftHealth = Schema.Struct({
  status: Schema.Literals(['ok', 'error']),
  since: Schema.Number,
  /** For an error: timeout, network, status or body. */
  kind: optional(Schema.Literals(['timeout', 'network', 'status', 'body'])),
})

export const AircraftSnapshot = Schema.Struct({
  /** When the server received the answer, or gave up on it. */
  fetched: Schema.Number,
  nextDue: Schema.Number,
  /** In seconds. */
  pollInterval: Schema.Number,
  provider: AircraftProvider,
  health: AircraftHealth,
  /** When the feed last answered; none until it has. */
  lastAnswer: optional(Schema.Number),
  aircraft: Schema.Array(SnapshotAircraft),
})

export type AircraftSnapshot = typeof AircraftSnapshot.Type
export type SnapshotAircraft = typeof SnapshotAircraft.Type
export type AircraftProvider = typeof AircraftProvider.Type
export type AircraftHealth = typeof AircraftHealth.Type
