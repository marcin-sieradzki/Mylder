// The stop and trip answers (docs/screens.md, "Vehicle detail" and "Stop departures"): a stop's
// departures and a trip's calls from the timetable plus the snapshot's delay for each trip. They
// share nothing with the run but the snapshot, so they are pure functions of the two; the tracker
// reads the snapshot and calls them. The on-demand calls (`on-demand.ts`, `stop-board.ts`) fall
// back to them, and the trip's on-demand detail (`trip-detail.ts`) builds on them. Each stop
// answer finds its stop once and reads its calls once, from the service days its window may
// reach, the next one too just before midnight. A Metro line reads as an interval, not as
// departures, until the snapshot has carried realtime for it (ADR 0006); a stop's interval rows
// and an interval trip's panel share one reading of it (`intervalAtStop`).
import 'server-only'
import { shownAt } from '../domain/departure.ts'
import { intervalOf, runsToInterval, type Interval } from '../domain/interval.ts'
import { timedCalls } from '../domain/trip-motion.ts'
import { MODES, type IsoDate, type LineRecord, type Mode } from '../timetable/format.ts'
import { platformId } from '../timetable/stops.ts'
import { hourStart } from '../timetable/time.ts'
import type { PlannedTrip } from '../timetable/trips.ts'
import type { Disruption } from './disruptions.ts'
import type { Snapshot, SnapshotTrip } from './snapshot.ts'
import type { Timetable } from './timetable.ts'

/** How long a stop's departures look ahead (docs/screens.md, "Stop departures"). */
export const DEPARTURES_AHEAD = 30 * 60_000

/**
 * The most departures of each mode a stop's answer lists, its interval rows aside: per mode, so
 * a mode the viewer's filters hide never crowds out one they show.
 */
export const MAX_DEPARTURES = 30

/** The planned departures an interval is worked out from: those in the current hour. */
const INTERVAL_HOUR = 3600_000

/**
 * Where an answer's times came from: the timetable plus the snapshot's delays, or an on-demand
 * call to Rejseplanen made at `at`.
 */
export type AnswerSource =
  { readonly kind: 'timetable' } | { readonly kind: 'rejseplanen'; readonly at: number }

const FROM_TIMETABLE: AnswerSource = { kind: 'timetable' }

/** A line as a panel names it: its public name, its mode and its Perron colour token. */
export type AnswerLine = Pick<LineRecord, 'name' | 'mode' | 'colour'>

/**
 * One departure from a stop: the timetable's time, and the expected one from the board or the
 * snapshot's delay for its trip. Its delay is `expected - scheduled`.
 */
export interface StopDeparture {
  readonly trip: string
  readonly line: string
  readonly mode: Mode
  /** The line's Perron colour token, such as `perron-color-transit-line-a`. */
  readonly colour: string
  readonly headsign: string
  readonly platform: string
  readonly scheduled: number
  readonly expected?: number
  /** The platform's track or stand, when the board gives one. */
  readonly track?: string
  /**
   * The trip won't call here: the board says so, or the snapshot has it cancelled whole or at this
   * call. The row stays, marked.
   */
  readonly cancelled?: true
  readonly state: SnapshotTrip['state']
}

/**
 * An interval line's departures from a stop in one direction (docs/screens.md, "Stop departures";
 * ADR 0006): how often it leaves, from the planned departures in the current hour, in place of
 * the departures' countdowns and clock times, which the Metro doesn't keep.
 */
export interface StopInterval {
  readonly line: string
  readonly mode: Mode
  readonly colour: string
  /** Where the next planned departure in this direction goes. */
  readonly headsign: string
  readonly platform: string
  /** Whole minutes between departures; none when the hour plans fewer than two. */
  readonly every?: Interval
}

export interface StopDepartures {
  /** The stop, and the lines that call at it, in the modes' order and then by name. */
  readonly stop: {
    readonly id: string
    readonly name: string
    readonly lines: readonly AnswerLine[]
  }
  /** The snapshot the states and delays came from, and when the answer is next due. */
  readonly fetched: number
  readonly nextDue: number
  readonly source: AnswerSource
  readonly departures: readonly StopDeparture[]
  /** The interval lines' rows, one per line and direction leaving in the window, by line. */
  readonly intervals: readonly StopInterval[]
  /** The stop's disruption messages, from the board and the disruption list, as received. */
  readonly messages: readonly Disruption[]
}

export interface TripCall {
  readonly index: number
  readonly stop: string
  readonly name: string
  readonly arrival: number
  readonly departure: number
  /**
   * From the trip's detail when the answer came from one, else the timetabled times shifted by
   * the snapshot's delay. None where neither says.
   */
  readonly expectedArrival?: number
  readonly expectedDeparture?: number
  /**
   * The trip won't call here: the detail cancels every side of the call it has (the arrival at
   * the last stop, the departure at the first, both between), or the snapshot has the call
   * cancelled. The call stays, marked.
   */
  readonly cancelled?: true
}

/**
 * One of the trip's own messages, from its detail: the disruption as received, and the first and
 * last of the trip's calls it covers, by `TripCall.index`, when it says which.
 */
export interface TripMessage extends Disruption {
  readonly calls?: { readonly first: number; readonly last: number }
}

export interface TripDetail {
  readonly key: string
  readonly line: string
  readonly mode: Mode
  /** The line's Perron colour token, such as `perron-color-transit-line-a`. */
  readonly colour: string
  readonly headsign: string
  readonly pattern: number
  readonly state: SnapshotTrip['state']
  /** The snapshot's delay for the trip, in seconds. */
  readonly delay?: number
  /**
   * Rejseplanen's own delay at the trip's next call, in seconds: the detail's expected time there
   * minus the timetabled one. Only in an answer from the detail, where it has an expected time.
   */
  readonly nextCallDelay?: number
  /** The whole trip is called off, by its detail or the snapshot; its calls stay, and so does its panel. */
  readonly cancelled?: true
  /**
   * The trip's line runs to an interval now, by the rule its stops' departures follow (ADR 0006):
   * its panel lists its calls without times.
   */
  readonly runsToInterval?: true
  /**
   * An interval line's interval at the trip's next stop this hour, which its panel shows in place
   * of times (ADR 0006); none for any other line, or an hour with under two departures.
   */
  readonly interval?: Interval
  readonly fetched: number
  readonly nextDue: number
  readonly source: AnswerSource
  readonly calls: readonly TripCall[]
  /** The trip's own messages, in an answer from its detail; none from the timetable. */
  readonly messages?: readonly TripMessage[]
}

/** What the answers read from a snapshot. */
export type SnapshotDelays = Pick<Snapshot, 'fetched' | 'nextDue' | 'trips'>

/** The snapshot's trips by key. */
export const tripsByKey = (snapshot: SnapshotDelays) =>
  new Map(snapshot.trips.map((trip) => [trip.key, trip]))

/** A trip's calls shifted by the snapshot's delay for it, when it has one. */
const withDelay = (trip: PlannedTrip, delay: number | undefined) =>
  delay === undefined ? undefined : timedCalls(trip.calls, delay)

/**
 * The service days whose trips may leave in the departures' window from a moment: those running
 * then, and the next one once the window passes midnight, whose first trips may leave before it
 * ends.
 */
export function serviceDaysAhead(timetable: Timetable, now: number): readonly IsoDate[] {
  return [
    ...new Set([
      ...timetable.serviceDaysAt(now),
      ...timetable.serviceDaysAt(now + DEPARTURES_AHEAD),
    ]),
  ]
}

/** A stop's index by its own id, or by the id of one of its platforms; -1 for neither. */
function stopIndexOf(timetable: Timetable, id: string): number {
  const { platforms, stops } = timetable.stops
  const byStop = stops.findIndex((stop) => stop.id === id)
  if (byStop >= 0) return byStop
  const platform = platforms.findIndex((each) => each.id === platformId(id))
  return platform >= 0 ? platforms[platform].stop : -1
}

/** A stop an answer is for: its index among the timetable's stops, and itself as the answer names it. */
export interface FoundStop {
  readonly index: number
  readonly stop: StopDepartures['stop']
}

/**
 * A stop by its own id, or by the id of one of its platforms, with the lines whose patterns call
 * at its platforms; undefined for neither. Found once for each answer.
 */
export function findStop(timetable: Timetable, id: string): FoundStop | undefined {
  const index = stopIndexOf(timetable, id)
  if (index < 0) return undefined
  const { id: stopId, name } = timetable.stops.stops[index]
  return { index, stop: { id: stopId, name, lines: linesAt(timetable, index) } }
}

/** One call of a trip at a stop, by the trip and the call's index. */
export interface StopCall {
  readonly trip: PlannedTrip
  readonly index: number
}

/**
 * Every departing call at a stop's platforms, a trip's last call aside, on the service days whose
 * trips may leave in the departures' window from a moment.
 */
export function callsAt(timetable: Timetable, stopIndex: number, now: number): StopCall[] {
  const { platforms } = timetable.stops
  const calls: StopCall[] = []
  for (const day of serviceDaysAhead(timetable, now)) {
    for (const trip of timetable.tripsOn(day)) {
      trip.calls.forEach((call, index) => {
        if (index < trip.calls.length - 1 && platforms[call.platform].stop === stopIndex) {
          calls.push({ trip, index })
        }
      })
    }
  }
  return calls
}

/**
 * How often a line leaves a stop in one direction, in whole minutes, from its planned departures
 * among the stop's calls (`callsAt`) in the current hour on the timetable's clock; none for an hour
 * that plans fewer than two. A stop's interval rows and an interval trip's panel both read it.
 */
export function intervalAtStop(
  timetable: Timetable,
  calls: readonly StopCall[],
  line: string,
  direction: number,
  now: number,
): Interval | undefined {
  const times = calls.flatMap(({ trip, index }) =>
    trip.line.name === line && trip.direction === direction ? [trip.calls[index].departure] : [],
  )
  const hour = hourStart(now, timetable.manifest.timezone)
  return intervalOf(times, hour, hour + INTERVAL_HOUR)
}

/** The lines whose patterns call at a stop's platforms, in the modes' order and then by name. */
function linesAt(timetable: Timetable, stopIndex: number): AnswerLine[] {
  const { platforms } = timetable.stops
  const { lines, patterns } = timetable.patterns
  const calling = new Set<number>()
  for (const pattern of patterns) {
    if (pattern.stops.some((platform) => platforms[platform].stop === stopIndex))
      calling.add(pattern.line)
  }
  return [...calling]
    .map((index) => lines[index])
    .sort(
      (a, b) =>
        MODES.indexOf(a.mode) - MODES.indexOf(b.mode) ||
        a.name.localeCompare(b.name, 'da', { numeric: true }),
    )
    .map(({ name, mode, colour }) => ({ name, mode, colour }))
}

/**
 * Whether a line runs to an interval at this moment, by the domain's rule: a Metro line, unless
 * the snapshot has carried realtime for one of its trips, or one of `rows` has realtime of its own.
 */
const lineRunsToInterval = (
  snapshot: SnapshotDelays,
  rows: readonly { mode: Mode; line: string; state: SnapshotTrip['state'] }[],
  line: Pick<AnswerLine, 'name' | 'mode'>,
): boolean =>
  runsToInterval(line, [
    ...snapshot.trips.map((trip) => ({ ...trip, realtime: trip.hadRealtime })),
    ...rows.map((row) => ({ ...row, realtime: row.state !== 'timetable-only' })),
  ])

/**
 * A stop's rows as its answer lists them: its interval lines' departures taken out and read as
 * one interval row per line and direction that leaves in the departures' window, from the stop's
 * calls (`callsAt`); the rest soonest first by the time each row's state shows, `MAX_DEPARTURES`
 * of each mode.
 */
export function listed(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  stop: StopDepartures['stop'],
  rows: readonly StopDeparture[],
  calls: readonly StopCall[],
  now: number,
): Pick<StopDepartures, 'departures' | 'intervals'> {
  const intervalLines = new Set(
    stop.lines.filter((line) => lineRunsToInterval(snapshot, rows, line)).map((line) => line.name),
  )
  const perMode = new Map<Mode, number>()
  const departures = rows
    .filter((row) => !(row.mode === 'metro' && intervalLines.has(row.line)))
    .sort((a, b) => shownAt(a, a.state) - shownAt(b, b.state))
    .filter((row) => {
      const listedSoFar = perMode.get(row.mode) ?? 0
      perMode.set(row.mode, listedSoFar + 1)
      return listedSoFar < MAX_DEPARTURES
    })
  if (intervalLines.size === 0) return { departures, intervals: [] }
  const { platforms } = timetable.stops
  /** Each interval line and direction's first call in the window. */
  const firsts = new Map<string, { at: number; call: StopCall }>()
  for (const call of calls) {
    const { trip, index } = call
    if (trip.line.mode !== 'metro' || !intervalLines.has(trip.line.name)) continue
    const at = trip.calls[index].departure
    if (at < now || at > now + DEPARTURES_AHEAD) continue
    const key = `${trip.line.name} ${trip.direction}`
    const first = firsts.get(key)
    if (!first || at < first.at) firsts.set(key, { at, call })
  }
  const intervals = [...firsts.values()].map(({ call: { trip, index } }): StopInterval => {
    const { name, mode, colour } = trip.line
    const platform = platforms[trip.calls[index].platform].id
    const row = { line: name, mode, colour, headsign: trip.headsign, platform }
    const every = intervalAtStop(timetable, calls, name, trip.direction, now)
    return every ? { ...row, every } : row
  })
  intervals.sort(
    (a, b) =>
      a.line.localeCompare(b.line, 'da', { numeric: true }) ||
      a.headsign.localeCompare(b.headsign, 'da'),
  )
  return { departures, intervals }
}

/** A planned trip of the service days that may run in the departures' window from a moment, by its key. */
export function plannedTrip(
  timetable: Timetable,
  tripKey: string,
  now: number,
): PlannedTrip | undefined {
  for (const day of serviceDaysAhead(timetable, now)) {
    const trip = timetable.tripsOn(day).find((each) => each.key === tripKey)
    if (trip) return trip
  }
  return undefined
}

/**
 * A found stop's departures in the 30 minutes after the snapshot, across its platforms, soonest
 * first, each at its timetabled time shifted by the snapshot's delay for its trip, a cancelled one
 * kept and marked, and its interval lines as intervals.
 */
export function departuresAt(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  { index, stop }: FoundStop,
): StopDepartures {
  const { platforms } = timetable.stops
  const now = snapshot.fetched
  const onMap = tripsByKey(snapshot)
  const calls = callsAt(timetable, index, now)
  // Each trip's calls shifted once, and only for a trip that calls here.
  const shifted = new Map<PlannedTrip, ReturnType<typeof withDelay>>()
  const departures: StopDeparture[] = []
  for (const { trip, index: i } of calls) {
    const live = onMap.get(trip.key)
    if (!shifted.has(trip)) shifted.set(trip, withDelay(trip, live?.delay))
    const call = trip.calls[i]
    const times = { scheduled: call.departure, expected: shifted.get(trip)?.[i].departure }
    const state = live?.state ?? 'timetable-only'
    // In the window by the time its state shows: a No signal row's is the timetabled time.
    const leaves = shownAt(times, state)
    if (leaves < now || leaves > now + DEPARTURES_AHEAD) continue
    const cancelled = live?.cancelled || live?.cancelledCalls?.includes(i)
    departures.push({
      trip: trip.key,
      line: trip.line.name,
      mode: trip.line.mode,
      colour: trip.line.colour,
      headsign: trip.headsign,
      platform: platforms[call.platform].id,
      scheduled: call.departure,
      ...(times.expected === undefined ? {} : { expected: times.expected }),
      state,
      ...(cancelled ? { cancelled: true as const } : {}),
    })
  }
  return {
    stop,
    fetched: now,
    nextDue: snapshot.nextDue,
    source: FROM_TIMETABLE,
    ...listed(timetable, snapshot, stop, departures, calls, now),
    messages: [],
  }
}

/**
 * A stop's departures from the timetable and the snapshot (`departuresAt`); undefined for a stop
 * the timetable doesn't know, by its own id or a platform's.
 */
export function stopDeparturesFrom(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  stopId: string,
): StopDepartures | undefined {
  const found = findStop(timetable, stopId)
  return found && departuresAt(timetable, snapshot, found)
}

/**
 * How often a Metro trip's line leaves the stop of its next call in the current hour, the trip's
 * direction only, as that stop's interval rows say.
 */
function intervalAt(timetable: Timetable, trip: PlannedTrip, now: number): Interval | undefined {
  if (trip.line.mode !== 'metro') return undefined
  const next = trip.calls.find((call) => call.departure >= now) ?? trip.calls[0]
  const stopIndex = timetable.stops.platforms[next.platform].stop
  const calls = callsAt(timetable, stopIndex, now)
  return intervalAtStop(timetable, calls, trip.line.name, trip.direction, now)
}

/**
 * A trip's calls at a moment, at their timetabled times and, when the snapshot's entry `live` has
 * a delay, those times shifted by it, with its state, what the snapshot has cancelled marked, and
 * a Metro trip's interval.
 */
export function tripDetailOf(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  trip: PlannedTrip,
  live: SnapshotTrip | undefined,
  now: number,
): TripDetail {
  const { platforms } = timetable.stops
  const expected = withDelay(trip, live?.delay)
  const toInterval = lineRunsToInterval(snapshot, [], trip.line)
  const interval = toInterval ? intervalAt(timetable, trip, now) : undefined
  return {
    key: trip.key,
    line: trip.line.name,
    mode: trip.line.mode,
    colour: trip.line.colour,
    headsign: trip.headsign,
    pattern: trip.pattern,
    state: live?.state ?? 'timetable-only',
    ...(live?.delay === undefined ? {} : { delay: live.delay }),
    ...(live?.cancelled ? { cancelled: true as const } : {}),
    ...(toInterval ? { runsToInterval: true as const } : {}),
    ...(interval ? { interval } : {}),
    fetched: snapshot.fetched,
    nextDue: snapshot.nextDue,
    source: FROM_TIMETABLE,
    calls: trip.calls.map((call, index) => ({
      index,
      stop: platforms[call.platform].id,
      name: platforms[call.platform].name,
      arrival: call.arrival,
      departure: call.departure,
      ...(expected
        ? {
            expectedArrival: expected[index].arrival,
            expectedDeparture: expected[index].departure,
          }
        : {}),
      ...(live?.cancelledCalls?.includes(index) ? { cancelled: true as const } : {}),
    })),
  }
}

/**
 * A trip's calls at a moment, at their timetabled times and, when the snapshot has a delay for
 * it, those times shifted by the delay; undefined for a trip not running today.
 */
export function tripDetailFrom(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  tripKey: string,
  now: number,
): TripDetail | undefined {
  const trip = plannedTrip(timetable, tripKey, now)
  if (!trip) return undefined
  return tripDetailOf(timetable, snapshot, trip, tripsByKey(snapshot).get(trip.key), now)
}
