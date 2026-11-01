// The snapshot (docs/live-data.md, "The snapshot"): one whole-city answer every browser polls, the
// same bytes for every viewer and both languages, so it carries codes and times, never words.
// Defined once here as a schema; the browser imports its types only. Times are milliseconds
// since the epoch, intervals and delays seconds.
import 'server-only'
import { Schema } from 'effect'
import { SOURCE_KINDS } from '../domain/source.ts'

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
  /**
   * SIRI-ET's delays for the trip, from its latest update (spec #146), kept once the table no
   * longer brings it, as for a No signal trip on a quiet feed; as steps: a call index and the delay
   * in seconds there, listed where the delay changes, the calls between taking the step before
   * them (`expectedTimes`, src/domain/trip-motion.ts). Opened trips and stops time each call by
   * them, as the map moves the trip.
   */
  steps: optional(Schema.Array(Schema.Tuple([Schema.Number, Schema.Number]))),
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

/** The disruption list's state; the list itself has its own route. */
export const DisruptionsSummary = Schema.Struct({
  /** When the list was last fetched, or null when no fetch has worked yet. */
  fetched: Schema.NullOr(Schema.Number),
  /** When it was last asked for, and whether that worked. */
  checked: Schema.Number,
  ok: Schema.Boolean,
  count: Schema.Number,
  /** Changes whenever the list does, so the browser fetches it again. */
  version: Schema.String,
})

export const SnapshotSource = Schema.Struct({
  /** The kinds `SOURCE_DESCRIPTIONS` describes (src/domain/source.ts), every one required. */
  kind: Schema.Literals(SOURCE_KINDS),
  /** The scenario or the recording's folder. */
  name: optional(Schema.String),
})

/**
 * Where the snapshot's updates come from (`MYLDER_UPDATES`, spec #146): SIRI-ET's update table
 * from the listener, the reader over a recording, or none; and how the feed stands.
 */
export const SnapshotUpdates = Schema.Struct({
  kind: Schema.Literals(['off', 'siri', 'recording']),
  /**
   * When the feed's last message was received, from any dataset: the latest a run has read, kept
   * through runs without the table; absent before any has come.
   */
  lastMessage: optional(Schema.Number),
  /** Whether the feed was fresh at fetch time: its last message under 5 min old. */
  fresh: Schema.Boolean,
  /** The snapshot's trips with an update this service day, by mode. */
  withUpdate: Schema.Record(Schema.String, Schema.Number),
  /** The table's journeys that joined no trip, by the mode of their dataset; counted, not drawn. */
  unmatched: Schema.Record(Schema.String, Schema.Number),
})

/** The run's own figures, which the about panel shows and a monitor can poll. */
export const Status = Schema.Struct({
  calls: Schema.Array(
    Schema.Struct({
      service: Schema.String,
      outcome: Schema.String,
      attempts: Schema.Number,
      ms: Schema.Number,
      /** The HTTP status of a call that failed with one. */
      status: optional(Schema.Number),
    }),
  ),
  /** Journeys in the answer that no trip of the timetable fits; counted, not drawn. */
  unmatched: Schema.Number,
  /** The snapshot's trips by mode and by data state. */
  modes: Schema.Record(Schema.String, Schema.Number),
  states: Schema.Record(Schema.String, Schema.Number),
  /**
   * The instance's CPU time over the run, in milliseconds: an upper bound, as it counts any other
   * request the instance served meanwhile.
   */
  cpuMs: Schema.Number,
  /** The timetable's prepared date, its last covered day, and days left and old, today counted. */
  timetable: Schema.Struct({
    prepared: Schema.String,
    last: Schema.String,
    daysLeft: Schema.Number,
    daysOld: Schema.Number,
  }),
})

export const Snapshot = Schema.Struct({
  fetched: Schema.Number,
  nextDue: Schema.Number,
  pollInterval: Schema.Number,
  serviceDay: Schema.String,
  timetableVersion: Schema.String,
  /** Set when the timetable has under 7 days of service left, for the page's notice. */
  timetableRunningOut: optional(Schema.Literal(true)),
  positionMode: PositionMode,
  /** In alternating mode, which mode this run asked in, or the last run that called. */
  answerMode: optional(Schema.Literals(['REPORT_ONLY', 'CALC_REPORT'])),
  /** The answer's own `planRtTs`. */
  apiTime: optional(Schema.String),
  api: ApiHealth,
  budget: Budget,
  store: Schema.Literals(['ok', 'unavailable']),
  /**
   * By mode, when a position answer last carried one of its trips, kept after those trips have
   * gone, for the "No bus positions since 08:09" card. Moments before the earliest service day
   * still running are dropped, so a mode no answer has carried since then is absent.
   */
  lastSeen: Schema.Record(Schema.String, Schema.Number),
  /** Null until the first `himsearch` (#57). */
  disruptions: Schema.NullOr(DisruptionsSummary),
  source: SnapshotSource,
  updates: SnapshotUpdates,
  status: Status,
  trips: Schema.Array(SnapshotTrip),
})

export type Snapshot = typeof Snapshot.Type
export type SnapshotTrip = typeof SnapshotTrip.Type
export type NextCall = typeof NextCall.Type
export type SnapshotUpdates = typeof SnapshotUpdates.Type
