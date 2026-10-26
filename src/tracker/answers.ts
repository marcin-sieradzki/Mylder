// The stop and trip answers (docs/screens.md, "Vehicle detail" and "Stop departures"): a stop's
// departures and a trip's calls from the timetable plus the snapshot's delay for each trip. They
// share nothing with the run but the snapshot, so they are pure functions of the two; the tracker
// reads the snapshot and calls them. The on-demand calls (`on-demand.ts`, `stop-board.ts`) fall
// back to them. A Metro line reads as an interval, not as departures, until the snapshot has
// carried realtime for it (ADR 0006).
import 'server-only'
import { shownAt } from '../domain/departure.ts'
import { intervalOf, type Interval } from '../domain/interval.ts'
import { timedCalls } from '../domain/trip-motion.ts'
import { MODES, type LineRecord, type Mode } from '../timetable/format.ts'
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
  readonly expectedArrival?: number
  readonly expectedDeparture?: number
  /** The trip won't call here: the snapshot has the call cancelled. The call stays, marked. */
  readonly cancelled?: true
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
  readonly delay?: number
  /** The whole trip is called off; its calls stay, and so does its panel. */
  readonly cancelled?: true
  /**
   * An interval line's interval at the trip's next stop this hour, which its panel shows in place
   * of times (ADR 0006); none for any other line, or an hour with under two departures.
   */
  readonly interval?: Interval
  readonly fetched: number
  readonly nextDue: number
  readonly source: AnswerSource
  readonly calls: readonly TripCall[]
}

/** What the answers read from a snapshot. */
export type SnapshotDelays = Pick<Snapshot, 'fetched' | 'nextDue' | 'trips'>

/** The snapshot's trips by key. */
export const tripsByKey = (snapshot: SnapshotDelays) =>
  new Map(snapshot.trips.map((trip) => [trip.key, trip]))

/** A trip's calls shifted by the snapshot's delay for it, when it has one. */
const withDelay = (trip: PlannedTrip, delay: number | undefined) =>
  delay === undefined ? undefined : timedCalls(trip.calls, delay)

/** A stop's index by its own id, or by the id of one of its platforms; -1 for neither. */
export function stopIndexOf(timetable: Timetable, id: string): number {
  const { platforms, stops } = timetable.stops
  const byStop = stops.findIndex((stop) => stop.id === id)
  if (byStop >= 0) return byStop
  const platform = platforms.findIndex((each) => each.id === platformId(id))
  return platform >= 0 ? platforms[platform].stop : -1
}

/** A stop as its answer names it, with the lines whose patterns call at its platforms. */
export function stopOf(timetable: Timetable, stopIndex: number): StopDepartures['stop'] {
  const { id, name } = timetable.stops.stops[stopIndex]
  return { id, name, lines: linesAt(timetable, stopIndex) }
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
 * Whether a line runs to an interval at this moment: a Metro line, unless the snapshot has
 * carried realtime for one of its trips, or one of the answer's rows has realtime of its own.
 */
function runsToInterval(
  snapshot: SnapshotDelays,
  rows: readonly StopDeparture[],
  line: AnswerLine,
): boolean {
  if (line.mode !== 'metro') return false
  const hadRealtime = snapshot.trips.some(
    (trip) => trip.mode === 'metro' && trip.line === line.name && trip.hadRealtime,
  )
  return (
    !hadRealtime &&
    !rows.some(
      (row) => row.mode === 'metro' && row.line === line.name && row.state !== 'timetable-only',
    )
  )
}

/**
 * A stop's rows as its answer lists them: its interval lines' departures taken out and read as
 * one interval row per line and direction that leaves in the departures' window, worked out from
 * the planned departures in the current hour on the timetable's clock; the rest soonest first by
 * the time each row's state shows, `MAX_DEPARTURES` of each mode.
 */
export function listed(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  stop: StopDepartures['stop'],
  rows: readonly StopDeparture[],
  now: number,
): Pick<StopDepartures, 'departures' | 'intervals'> {
  const intervalLines = new Set(
    stop.lines.filter((line) => runsToInterval(snapshot, rows, line)).map((line) => line.name),
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
  const stopIndex = stopIndexOf(timetable, stop.id)
  const { platforms } = timetable.stops
  const hour = hourStart(now, timetable.manifest.timezone)
  /** Each line and direction's planned departures, and its first in the window. */
  const directions = new Map<
    string,
    { times: number[]; next?: { at: number; row: StopInterval } }
  >()
  for (const day of timetable.serviceDaysAt(now)) {
    for (const trip of timetable.tripsOn(day)) {
      if (trip.line.mode !== 'metro' || !intervalLines.has(trip.line.name)) continue
      trip.calls.forEach((call, i) => {
        if (i === trip.calls.length - 1 || platforms[call.platform].stop !== stopIndex) return
        const key = `${trip.line.name} ${trip.direction}`
        const direction = directions.get(key) ?? { times: [] }
        directions.set(key, direction)
        const at = call.departure
        direction.times.push(at)
        if (at < now || at > now + DEPARTURES_AHEAD || (direction.next && direction.next.at <= at))
          return
        const { name, mode, colour } = trip.line
        const platform = platforms[call.platform].id
        direction.next = {
          at,
          row: { line: name, mode, colour, headsign: trip.headsign, platform },
        }
      })
    }
  }
  const intervals: StopInterval[] = []
  for (const { times, next } of directions.values()) {
    if (!next) continue
    const every = intervalOf(times, hour, hour + INTERVAL_HOUR)
    intervals.push(every ? { ...next.row, every } : next.row)
  }
  intervals.sort(
    (a, b) =>
      a.line.localeCompare(b.line, 'da', { numeric: true }) ||
      a.headsign.localeCompare(b.headsign, 'da'),
  )
  return { departures, intervals }
}

/** A planned trip of the service days running at a moment, by its key. */
export function plannedTrip(
  timetable: Timetable,
  tripKey: string,
  now: number,
): PlannedTrip | undefined {
  for (const day of timetable.serviceDaysAt(now)) {
    const trip = timetable.tripsOn(day).find((each) => each.key === tripKey)
    if (trip) return trip
  }
  return undefined
}

/**
 * A stop's departures in the 30 minutes after the snapshot, across its platforms, soonest first,
 * each at its timetabled time shifted by the snapshot's delay for its trip, a cancelled one kept
 * and marked, and its interval lines as intervals; undefined for a stop the timetable doesn't know, by its own id or a platform's.
 */
export function stopDeparturesFrom(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  stopId: string,
): StopDepartures | undefined {
  const stopIndex = stopIndexOf(timetable, stopId)
  if (stopIndex < 0) return undefined
  const { platforms } = timetable.stops
  const now = snapshot.fetched
  const onMap = tripsByKey(snapshot)
  const departures: StopDeparture[] = []
  for (const day of timetable.serviceDaysAt(now)) {
    for (const trip of timetable.tripsOn(day)) {
      const live = onMap.get(trip.key)
      let expected: ReturnType<typeof withDelay> | null = null
      trip.calls.forEach((call, i) => {
        if (i === trip.calls.length - 1 || platforms[call.platform].stop !== stopIndex) return
        // Shift the trip's calls once, and only for a trip that calls here.
        if (expected === null) expected = withDelay(trip, live?.delay)
        const times = { scheduled: call.departure, expected: expected?.[i].departure }
        const state = live?.state ?? 'timetable-only'
        // In the window by the time its state shows: a No signal row's is the timetabled time.
        const leaves = shownAt(times, state)
        if (leaves < now || leaves > now + DEPARTURES_AHEAD) return
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
      })
    }
  }
  const stop = stopOf(timetable, stopIndex)
  return {
    stop,
    fetched: now,
    nextDue: snapshot.nextDue,
    source: FROM_TIMETABLE,
    ...listed(timetable, snapshot, stop, departures, now),
    messages: [],
  }
}

/**
 * How often a Metro trip's line leaves the platform of its next call in the current hour, the
 * trip's direction only, from the planned departures of the service days running then, as a
 * stop's interval rows are worked out.
 */
function intervalAt(timetable: Timetable, trip: PlannedTrip, now: number): Interval | undefined {
  if (trip.line.mode !== 'metro') return undefined
  const next = trip.calls.find((call) => call.departure >= now) ?? trip.calls[0]
  const departures: number[] = []
  for (const day of timetable.serviceDaysAt(now)) {
    for (const each of timetable.tripsOn(day)) {
      if (each.line.name !== trip.line.name || each.direction !== trip.direction) continue
      each.calls.forEach((call, i) => {
        if (i < each.calls.length - 1 && call.platform === next.platform)
          departures.push(call.departure)
      })
    }
  }
  const hour = hourStart(now, timetable.manifest.timezone)
  return intervalOf(departures, hour, hour + INTERVAL_HOUR)
}

/**
 * A trip's calls at a moment, at their timetabled times and, when the snapshot has a delay for
 * it, those times shifted by the delay, with what the snapshot has cancelled marked, and a Metro
 * trip's interval; undefined for a trip not running today.
 */
export function tripDetailFrom(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  tripKey: string,
  now: number,
): TripDetail | undefined {
  const trip = plannedTrip(timetable, tripKey, now)
  if (!trip) return undefined
  const { platforms } = timetable.stops
  const live = tripsByKey(snapshot).get(trip.key)
  const expected = withDelay(trip, live?.delay)
  const interval = intervalAt(timetable, trip, now)
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
