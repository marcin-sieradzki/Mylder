// The snapshot (docs/live-data.md, "The snapshot"): one whole-city answer every browser polls, the
// same bytes for every viewer and both languages, so it carries codes and times, never words.
// Defined once here as a schema; the browser imports its types only. Times are milliseconds
// since the epoch, intervals and delays seconds.
import 'server-only'
import { Schema } from 'effect'

const optional = Schema.optionalKey

export const DataState = Schema.Literals([
  'live',
  'ageing',
  'estimated',
  'timetable-only',
  'no-signal',
])

export const PositionMode = Schema.Literals(['REPORT_ONLY', 'CALC_REPORT', 'alternating', 'none'])

export const Mode = Schema.Literals(['bus', 'metro', 's-tog', 'train', 'light-rail'])

/** One of a trip's next calls: its index in the pattern, its platform and when it leaves. */
export const NextCall = Schema.Struct({
  index: Schema.Number,
  stop: Schema.String,
  /** The expected departure, or the arrival at the last stop. */
  time: Schema.Number,
})

/** One trip on the map, Waiting or underway, including Timetable only ones. */
export const SnapshotTrip = Schema.Struct({
  key: Schema.String,
  line: Schema.String,
  mode: Mode,
  /** The pattern's index in the timetable version's patterns file. */
  pattern: Schema.Number,
  headsign: Schema.String,
  state: DataState,
  /** Where the position came from: a report, a computed position, or Mylder's own placement. */
  source: Schema.Literals(['reported', 'computed', 'timetable']),
  seen: optional(Schema.Number),
  reported: optional(Schema.Number),
  updated: optional(Schema.Number),
  hadRealtime: Schema.Boolean,
  delay: optional(Schema.Number),
  /** Latitude and longitude at fetch time, on the pattern's path. */
  position: Schema.Tuple([Schema.Number, Schema.Number]),
  /** The same point as metres along the pattern's path. */
  progress: Schema.Number,
  next: Schema.Array(NextCall),
  waiting: optional(Schema.Literal(true)),
  cancelled: optional(Schema.Literal(true)),
  extra: optional(Schema.Literal(true)),
  cancelledCalls: optional(Schema.Array(Schema.Number)),
  vehicleNumber: optional(Schema.String),
  /** Rejseplanen's journey number and day, `ZI@DA`, once the trip has been in an answer. */
  journey: optional(Schema.String),
})

export const ApiHealth = Schema.Struct({
  status: Schema.Literals(['ok', 'empty', 'error', 'spent']),
  since: Schema.Number,
  /** For an error: timeout, network, status, body or refused. */
  kind: optional(Schema.String),
})

export const Budget = Schema.Struct({
  level: Schema.Literals(['normal', 'stretched', 'tight', 'spent']),
  /** Calls this month, every source's own count. */
  calls: Schema.Number,
  /** When spent, the date live data resumes. */
  resumes: optional(Schema.String),
})

export const DisruptionsSummary = Schema.Struct({
  fetched: Schema.Number,
  ok: Schema.Boolean,
  count: Schema.Number,
  version: Schema.String,
})

export const SnapshotSource = Schema.Struct({
  kind: Schema.Literals(['simulated', 'recording', 'rejseplanen']),
  /** The scenario or the recording's folder. */
  name: optional(Schema.String),
})

/** The run's own figures, which the about panel shows and a monitor can poll. */
export const Status = Schema.Struct({
  calls: Schema.Array(
    Schema.Struct({
      service: Schema.String,
      outcome: Schema.String,
      attempts: Schema.Number,
      ms: Schema.Number,
    }),
  ),
  /** Journeys in the answer that no trip of the timetable fits; counted, not drawn. */
  unmatched: Schema.Number,
  states: Schema.Record(Schema.String, Schema.Number),
})

export const Snapshot = Schema.Struct({
  fetched: Schema.Number,
  nextDue: Schema.Number,
  pollInterval: Schema.Number,
  serviceDay: Schema.String,
  timetableVersion: Schema.String,
  positionMode: PositionMode,
  /** In alternating mode, which mode this run asked in, or the last run that called. */
  answerMode: optional(Schema.Literals(['REPORT_ONLY', 'CALC_REPORT'])),
  /** The answer's own `planRtTs`. */
  apiTime: optional(Schema.String),
  api: ApiHealth,
  budget: Budget,
  store: Schema.Literals(['ok', 'unavailable']),
  /** Null until the first `himsearch` (#57). */
  disruptions: Schema.NullOr(DisruptionsSummary),
  source: SnapshotSource,
  status: Status,
  trips: Schema.Array(SnapshotTrip),
})

export type Snapshot = typeof Snapshot.Type
export type SnapshotTrip = typeof SnapshotTrip.Type
export type NextCall = typeof NextCall.Type
