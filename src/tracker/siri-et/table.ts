// The update table (spec #146): what the SIRI-ET reader holds, as the listener writes it to the
// store and the tracker reads it. The contract between the two, so it is versioned and defined
// once here as a schema both sides decode with. Times are milliseconds since the epoch, delays
// seconds, as in the snapshot.
import 'server-only'
import { Schema } from 'effect'

const optional = Schema.optionalKey

/** The table's version. A change to its shape raises it, and a reader of another refuses it. */
export const TABLE_VERSION = 1

/** One call of a journey: its stop as SIRI-ET names it, and when it was due. */
export const CallRef = Schema.Struct({
  /** `StopPointRef`, which equals the timetable's platform or stop id without leading zeros. */
  stop: Schema.String,
  /** The aimed departure, or the aimed arrival at a call with no departure, such as the last. */
  aimed: Schema.Number,
})

/** From this call on, the journey runs `delay` seconds late, until the next step. */
export const DelayStep = Schema.Struct({
  ...CallRef.fields,
  /** Expected minus aimed departure (arrival at a call with no departure). Negative when early. */
  delay: Schema.Number,
})

/** One journey with an update, which calls inside the box and hasn't finished. */
export const TableJourney = Schema.Struct({
  /** The Dataudveksleren dataset it came from: `788` Movia, `785` DSB, `801` S-tog, `799` Lokaltog. */
  dataset: Schema.String,
  /** `DataFrameRef`: the service day. */
  day: Schema.String,
  /** `DatedVehicleJourneyRef`. */
  journey: Schema.String,
  /** `LineRef`: the public line name, or for DSB's trains the train number. */
  line: Schema.String,
  operator: optional(Schema.String),
  /** `OriginRef` and `DestinationRef`: the journey's first and last stops. */
  origin: Schema.String,
  destination: Schema.String,
  /** `TrainNumberRef`. */
  trainNumber: optional(Schema.String),
  /** When the latest message about it was received. */
  received: Schema.Number,
  cancelled: optional(Schema.Literal(true)),
  /** The earliest call held, so a journey with no delay can still be joined to its trip. */
  first: optional(CallRef),
  /** The calls a running journey won't serve; none on a cancelled journey, which serves none. */
  cancelledCalls: optional(Schema.Array(CallRef)),
  /** Its delays, in call order, listed only where the delay changes from the call before. */
  steps: Schema.Array(DelayStep),
})

/** What the reader counted of one dataset's messages since it started. */
export const DatasetCounts = Schema.Struct({
  lastMessageAt: Schema.Number,
  /** Every message received, read or not. */
  messages: Schema.Number,
  /** Journeys read from them, each message's counted. */
  journeyUpdates: Schema.Number,
  /** Messages skipped as malformed. */
  malformed: Schema.Number,
  /** Messages skipped as over the size limit. */
  tooLarge: Schema.Number,
  /** Journeys skipped for want of an identifying part. */
  skippedJourneys: Schema.Number,
})

export const UpdateTable = Schema.Struct({
  version: Schema.Literal(TABLE_VERSION),
  writtenAt: Schema.Number,
  /** The last message's received time, from any dataset. */
  lastMessageAt: optional(Schema.Number),
  /** Who keeps the reader: the listener's version and when it started. */
  listener: Schema.Struct({ version: Schema.String, startedAt: Schema.Number }),
  /** The timetable version whose stops the box filter used. */
  timetableVersion: Schema.String,
  datasets: Schema.Record(Schema.String, DatasetCounts),
  /** Journeys held, in the box or not, and journeys dropped over the cap since it started. */
  held: Schema.Number,
  evicted: Schema.Number,
  journeys: Schema.Array(TableJourney),
})

export type CallRef = typeof CallRef.Type
export type DelayStep = typeof DelayStep.Type
export type TableJourney = typeof TableJourney.Type
export type DatasetCounts = typeof DatasetCounts.Type
export type UpdateTable = typeof UpdateTable.Type
