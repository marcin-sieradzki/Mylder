// The data-state rule, as docs/data-states.md gives it. The server runs it at fetch time to set each
// trip's state, and the browser runs it every frame from the same fields and the clock, so a dot
// ages by the same rule on both sides. Times are milliseconds since the epoch.

/** How fresh a trip's position is, from the vehicle's own word down to the plan alone. */
export type DataState = 'live' | 'ageing' | 'estimated' | 'timetable-only' | 'no-signal'

/**
 * Which `journeyPos` mode the tracker calls in: reports only, computed positions mixed with
 * reports, the two on alternate polls, or no position calls at all.
 */
export type PositionMode = 'REPORT_ONLY' | 'CALC_REPORT' | 'alternating' | 'none'

/** How Rejseplanen last answered, and since when it has answered that way. */
export interface ApiHealth {
  readonly status: 'ok' | 'empty' | 'error' | 'spent'
  readonly since: number
}

/** What realtime a trip has had this service day: the fields the snapshot carries for it. */
export interface TripRealtime {
  /** When a position answer of either mode last carried the trip. */
  readonly seen?: number
  /** When a `REPORT_ONLY` answer last carried the trip. Only these can make it Live or Ageing. */
  readonly reported?: number
  /**
   * When an update (an opened stop or vehicle) last gave the trip an expected time, a platform or
   * a cancellation. A departure row with none of them, such as a Metro row without a prognosis,
   * is no update.
   */
  readonly updated?: number
  /** Whether any answer this service day has carried the trip. */
  readonly hadRealtime: boolean
}

/** The snapshot's side of the rule: its clock, its poll and how the API answered. */
export interface DataStateContext {
  /** The moment to decide at. */
  readonly now: number
  /** When the snapshot was built: the time of its answer, when the health is ok. */
  readonly fetched: number
  /** The snapshot's poll interval, in seconds. */
  readonly pollInterval: number
  readonly positionMode: PositionMode
  readonly health: ApiHealth
  /**
   * SIRI-ET's update feed, when updates are on (spec #146): when its table's last message was
   * received, or nothing when the table is gone from the store. Whether the feed is fresh, not the
   * position answers, then decides whether an update keeps a trip Estimated (`updatesContext`).
   */
  readonly updates?: { readonly lastMessage?: number }
}

/** The Live limit is this many report intervals, so one missed answer ends nothing and two do. */
export const LIVE_LIMIT_INTERVALS = 2.5

/** The Live limit never runs past this, however long the interval. */
export const LIVE_LIMIT_MAX = 4 * 60_000

/** A report this old is no longer Ageing. */
export const AGEING_ENDS = 5 * 60_000

/** A position answer's computed position keeps a trip Estimated for this long. */
export const FRESH_REALTIME = 5 * 60_000

/** A trip missing from position answers this long, or with no position answers at all, is No signal. */
export const NO_SIGNAL_AFTER = 5 * 60_000

/** SIRI-ET's update feed is fresh while its last message is younger than this. */
export const UPDATES_FRESH = 5 * 60_000

/**
 * The time between two report answers, in seconds: the poll interval, or two of them when the
 * modes alternate and only every other answer carries reports.
 */
export function reportInterval(pollInterval: number, positionMode: PositionMode): number {
  return positionMode === 'alternating' ? 2 * pollInterval : pollInterval
}

/** How long a report keeps a trip Live, in milliseconds. */
export function liveLimit(pollInterval: number, positionMode: PositionMode): number {
  const interval = reportInterval(pollInterval, positionMode) * 1000
  return Math.min(LIVE_LIMIT_INTERVALS * interval, LIVE_LIMIT_MAX)
}

/**
 * When the latest good position answer arrived: the snapshot's own time while the API answers
 * well, else the moment it stopped. A browser whose polls fail keeps an old snapshot, so its
 * answer ages by the clock just as an outage does.
 */
function lastAnswer({ fetched, health }: DataStateContext): number {
  return health.status === 'ok' ? fetched : Math.min(health.since, fetched)
}

/** Whether SIRI-ET's update feed is fresh at `now`: its table present, its last message under 5 min old. */
export function feedFresh(lastMessage: number | undefined, now: number): boolean {
  return lastMessage !== undefined && now - lastMessage < UPDATES_FRESH
}

/**
 * The feed's part of the context, from the snapshot's `updates` (or the run's, as it builds them):
 * none while updates are off, so position answers judge updates as before; otherwise the table's
 * last message, if a table is there.
 */
export function updatesContext(feed: {
  readonly kind: string
  readonly lastMessage?: number
}): Pick<DataStateContext, 'updates'> {
  if (feed.kind === 'off') return {}
  return { updates: feed.lastMessage === undefined ? {} : { lastMessage: feed.lastMessage } }
}

/**
 * Whether an update is still current: with SIRI-ET's feed on, while the feed is fresh, its table
 * present and its last message under 5 min old; without it, while a position answer has arrived in
 * the last 5 min. Silence is not judged per trip, since SIRI-ET sends a trip's update only when
 * something changes.
 */
function updatesCurrent(context: DataStateContext): boolean {
  const { now, updates } = context
  if (!updates) return now - lastAnswer(context) < NO_SIGNAL_AFTER
  return feedFresh(updates.lastMessage, now)
}

/**
 * Since when a No signal trip has had no signal, as its label says: the last position answer that
 * carried it, or its last report; else, for a trip whose realtime was an update, the last message
 * of SIRI-ET's feed while the feed is on (`updates`, the context's), since its update held until
 * the feed went quiet, and otherwise the update itself. None for a trip with no realtime.
 */
export function noSignalSince(
  trip: TripRealtime,
  updates: DataStateContext['updates'],
): number | undefined {
  const position = trip.seen ?? trip.reported
  if (position !== undefined || trip.updated === undefined) return position
  return Math.max(trip.updated, updates?.lastMessage ?? -Infinity)
}

/**
 * A trip's data state at a moment: the first of the rules in docs/data-states.md that holds.
 * Every Metro trip falls to Timetable only because no answer carries it, and gets the ordinary
 * states the day one does (ADR 0006). A cancelled trip is not drawn, so it needs no state.
 */
export function dataState(trip: TripRealtime, context: DataStateContext): DataState {
  const { now } = context
  const age = (time: number | undefined) => (time === undefined ? Infinity : now - time)

  if (age(trip.reported) < liveLimit(context.pollInterval, context.positionMode)) return 'live'
  if (age(trip.reported) < AGEING_ENDS) return 'ageing'
  // Reports are older than Ageing, so a position answer this fresh carried a computed position.
  if (age(trip.seen) < FRESH_REALTIME) return 'estimated'
  const updateIsLatest =
    trip.updated !== undefined && (trip.seen === undefined || trip.updated > trip.seen)
  if (updateIsLatest && updatesCurrent(context)) return 'estimated'
  if (!trip.hadRealtime) return 'timetable-only'
  return 'no-signal'
}
