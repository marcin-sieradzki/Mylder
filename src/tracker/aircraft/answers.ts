// The answer adsb.lol and adsb.fi both give to a circle query (docs/aircraft.md, "The feed"):
// readsb's aircraft list, as its `README-json.md` documents it, with the fields Mylder reads. One
// schema for both, decoded by every source; any other field, such as the answer's `msg`, `total`,
// `ctime` and `ptime` or an aircraft's `r`, `squawk` and `rssi`, is left alone. Its contract
// fixture in `fixtures/` is a real adsb.lol answer, the weekday recording's first (#135).
import 'server-only'
import { Schema } from 'effect'

const optional = Schema.optionalKey

/** A position readsb no longer counts as current, kept for an aircraft that has gone quiet. */
export const LastPosition = Schema.Struct({
  lat: Schema.Number,
  lon: Schema.Number,
  /** Seconds since this position, at the answer's `now`. */
  seen_pos: Schema.Number,
})

/** One aircraft as the feed carries it. */
export const ReadsbAircraft = Schema.Struct({
  /** The ICAO address; a hex that starts with `~` is not one, such as a TIS-B track's. */
  hex: Schema.String,
  /** The callsign, padded with spaces to eight characters; `@@@@@@@@` while it isn't known. */
  flight: optional(Schema.String),
  /** The type code from the feed's database, such as `A20N`. */
  t: optional(Schema.String),
  /** Present while the position is current: under 60 s old. */
  lat: optional(Schema.Number),
  lon: optional(Schema.Number),
  /** Barometric altitude in feet, or `"ground"`. */
  alt_baro: optional(Schema.Union([Schema.Number, Schema.Literal('ground')])),
  /** Ground speed in knots. */
  gs: optional(Schema.Number),
  /** Track over the ground, degrees clockwise from true north. */
  track: optional(Schema.Number),
  /** Seconds since the position, at the answer's `now`. */
  seen_pos: optional(Schema.Number),
  /** How the latest message came: `adsb_icao`, `adsb_icao_nt`, `mlat`, `tisb_other` and the rest. */
  type: optional(Schema.String),
  /** The emitter category, such as `A3`; `C1` to `C3` are surface vehicles and obstacles. */
  category: optional(Schema.String),
  /** Bits from the feed's database: 1 military, 2 interesting, 4 PIA, 8 LADD. */
  dbFlags: optional(Schema.Number),
  /** A rough position from the receiver's own location, when there is no other. */
  rr_lat: optional(Schema.Number),
  rr_lon: optional(Schema.Number),
  lastPosition: optional(LastPosition),
})

export const ReadsbAnswer = Schema.Struct({
  /** When the answer was made: milliseconds in the APIs' answers, seconds in readsb's files. */
  now: Schema.Number,
  ac: Schema.Array(ReadsbAircraft),
})

export type ReadsbAnswer = typeof ReadsbAnswer.Type
export type ReadsbAircraft = typeof ReadsbAircraft.Type
