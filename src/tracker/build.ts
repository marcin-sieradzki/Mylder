// Building the snapshot's trips: every trip the timetable puts on the map at a moment, joined to
// the journeys of a `journeyPos` answer and to what earlier runs saw of it, each placed on its
// path and given its data state by the domain rules (docs/data-states.md). Plain functions over
// the timetable; the run in `tracker.ts` supplies the moment, the answer, the history and the
// health.
import 'server-only'
import {
  dataState,
  FRESH_REALTIME,
  type ApiHealth,
  type DataStateContext,
} from '../domain/data-state.ts'
import {
  delayOf,
  pointAt,
  progressAt,
  snapToPath,
  timedCalls,
  timelineFrom,
  timelineOf,
  tripPhase,
  type Position,
  type TripPhase,
  type Call,
  type TimedCall,
} from '../domain/trip-motion.ts'
import { wallClock } from '../timetable/time.ts'
import type { PlannedTrip } from '../timetable/trips.ts'
import { joinJourney } from './join.ts'
import type { PositionJourney, Stop } from './rejseplanen/answers.ts'
import type { NextCall, SnapshotTrip } from './snapshot.ts'
import type { Timetable } from './timetable.ts'

const onMap = (phase: TripPhase) => phase === 'waiting' || phase === 'underway'

/** How many of its next calls a trip carries in the snapshot. */
export const NEXT_CALLS = 3

/** The position answer a snapshot is built from, if a call answered. */
export interface PositionAnswer {
  readonly journeys: readonly PositionJourney[]
  /** The mode this answer was asked in; only `REPORT_ONLY` positions are reports. */
  readonly mode: 'REPORT_ONLY' | 'CALC_REPORT'
}

/**
 * What the tracker remembers between runs of a trip that has had realtime this service day
 * (docs/live-data.md, "What the store is"). A trip's key names its service day, so a trip with
 * an entry had realtime today. Kept until the trip has arrived on its expected times.
 */
export interface TripHistory {
  /** The position the latest position answer of either mode gave it. */
  readonly seen?: Position
  /** The position the latest `REPORT_ONLY` answer gave it: its last report. */
  readonly reported?: Position
  /** Its last known delay, in seconds, which it keeps for the rest of its day. */
  readonly delay?: number
  /** Rejseplanen's journey, `ZI@DA`. */
  readonly journey?: string
}

/** Each trip's history, by trip key. */
export type History = Readonly<Record<string, TripHistory>>

export interface BuildInput {
  readonly timetable: Timetable
  readonly now: number
  readonly answer?: PositionAnswer
  readonly history?: History
  readonly context: Omit<DataStateContext, 'now' | 'fetched'> & { readonly health: ApiHealth }
}

export interface Built {
  readonly trips: SnapshotTrip[]
  readonly unmatched: number
  /** The history to keep for the next run. */
  readonly history: History
}

/** `HH:MM:SS` on `YYYY-MM-DD` in the timetable's zone, as a moment. */
function moment(date: string | undefined, time: string | undefined, timezone: string) {
  if (!date || !time) return undefined
  const [h, m, s] = time.split(':').map(Number)
  return wallClock(date, h * 3600 + m * 60 + (s || 0), timezone)
}

/**
 * The trip's calls with the expected times the journey's stops give. A stop with a prognosis and
 * no realtime time keeps its plan, as Rejseplanen leaves the time out when it equals the plan.
 */
function callsWithStops(
  timetable: Timetable,
  trip: PlannedTrip,
  stops: readonly Stop[] | undefined,
): Call[] {
  const calls: Call[] = trip.calls.map(({ arrival, departure }) => ({ arrival, departure }))
  const { platforms } = timetable.stops
  const { timezone } = timetable.manifest
  let from = 0
  for (const stop of stops ?? []) {
    let i = stop.routeIdx ?? -1
    if (trip.calls[i] === undefined || platforms[trip.calls[i].platform].id !== stop.extId) {
      i = trip.calls.findIndex((call, j) => j >= from && platforms[call.platform].id === stop.extId)
    }
    if (i < 0) continue
    from = i + 1
    const planned = calls[i]
    const arrival =
      moment(stop.rtArrDate, stop.rtArrTime, timezone) ??
      (stop.arrPrognosisType ? planned.arrival : undefined)
    const departure =
      moment(stop.rtDepDate, stop.rtDepTime, timezone) ??
      (stop.depPrognosisType ? planned.departure : undefined)
    calls[i] = {
      ...planned,
      ...(arrival === undefined ? {} : { expectedArrival: arrival }),
      ...(departure === undefined ? {} : { expectedDeparture: departure }),
    }
  }
  return calls
}

/** Up to three calls still ahead at a moment: their index, platform and time. */
function nextCalls(
  timetable: Timetable,
  trip: PlannedTrip,
  timed: readonly TimedCall[],
  now: number,
): NextCall[] {
  const next: NextCall[] = []
  const last = timed.length - 1
  for (let i = 0; i <= last && next.length < NEXT_CALLS; i++) {
    const time = i === last ? timed[i].arrival : timed[i].departure
    if (time <= now) continue
    next.push({ index: i, stop: timetable.stops.platforms[trip.calls[i].platform].id, time })
  }
  return next
}

/**
 * How many trips the timetable has underway at a moment, of the modes position answers carry:
 * every mode but the Metro (ADR 0006). An empty answer means something only when this is high.
 */
export function expectedUnderway(timetable: Timetable, now: number): number {
  let count = 0
  for (const day of timetable.serviceDaysAt(now)) {
    for (const trip of timetable.tripsOn(day)) {
      if (trip.line.mode !== 'metro' && tripPhase(trip.calls, now) === 'underway') count++
    }
  }
  return count
}

/**
 * The position to draw a trip from, by its state (docs/data-states.md, "Where a trip is drawn"):
 * Live and Ageing its last report, Estimated a fresh computed position, and otherwise none, so it
 * moves on the timetable plus its last delay.
 */
function positionToDraw(
  state: SnapshotTrip['state'],
  { seen, reported }: TripHistory,
  now: number,
): { readonly position?: Position; readonly source: SnapshotTrip['source'] } {
  if ((state === 'live' || state === 'ageing') && reported) {
    return { position: reported, source: 'reported' }
  }
  if (state === 'estimated' && seen && now - seen.time < FRESH_REALTIME) {
    return { position: seen, source: 'computed' }
  }
  return { source: 'timetable' }
}

/**
 * The snapshot's trips: every trip the timetable puts on the map at the moment, and every
 * journey of the answer joined to its trip, with what earlier runs saw of them. A trip the
 * answer leaves out keeps its history and ages by the clock; a journey no trip fits is counted,
 * not drawn.
 */
export function buildTrips({ timetable, now, answer, history = {}, context }: BuildInput): Built {
  const joined = new Map<string, { journey: PositionJourney; ref: string }>()
  let unmatched = 0
  for (const journey of answer?.journeys ?? []) {
    const match = joinJourney(timetable, journey, joined)
    if (match) joined.set(match.trip.key, { journey, ref: match.ref.journey })
    else unmatched++
  }
  const ctx: DataStateContext = { ...context, now, fetched: now }
  const trips: SnapshotTrip[] = []
  const kept: Record<string, TripHistory> = {}
  for (const day of timetable.serviceDaysAt(now)) {
    for (const trip of timetable.tripsOn(day)) {
      const realtime = joined.get(trip.key)
      const before = history[trip.key] as TripHistory | undefined
      if (!realtime && !before && !onMap(tripPhase(trip.calls, now))) continue
      const path = timetable.pathOf(trip.pattern)
      const calls = realtime
        ? callsWithStops(timetable, trip, realtime.journey.Stops?.Stop)
        : trip.calls
      const delay = (realtime ? delayOf(calls) : undefined) ?? before?.delay
      const timed = timedCalls(calls, before?.delay)
      // A trip that has arrived on its expected times is done with, whatever an answer says.
      const phase = tripPhase(timed, now)
      if (phase === 'finished') continue
      const timeline = timelineOf(timed, path)
      const atFirstStop = now < timed[0].departure
      let position: Position | undefined
      if (realtime) {
        // Before it leaves, a trip stands at its first stop, wherever its report puts it.
        const point = [realtime.journey.lat, realtime.journey.lon] as const
        const hint = progressAt(timeline, now, path.length)
        position = { time: now, progress: atFirstStop ? 0 : snapToPath(path, point, hint) }
      }
      const reportedNow = position && answer?.mode === 'REPORT_ONLY'
      const journey = realtime?.ref ?? before?.journey
      const seen = position ?? before?.seen
      const reported = reportedNow ? position : before?.reported
      const remembered: TripHistory = {
        ...(seen ? { seen } : {}),
        ...(reported ? { reported } : {}),
        ...(delay === undefined ? {} : { delay }),
        ...(journey ? { journey } : {}),
      }
      const hadRealtime = realtime !== undefined || before !== undefined
      if (hadRealtime) kept[trip.key] = remembered
      // More than 5 min before it leaves on its expected times, a trip is remembered, not drawn.
      if (phase === 'upcoming') continue
      const fields = {
        ...(seen ? { seen: seen.time } : {}),
        ...(reported ? { reported: reported.time } : {}),
        hadRealtime,
      }
      const state = dataState(fields, ctx)
      const drawn = positionToDraw(state, remembered, now)
      const progress = atFirstStop
        ? 0
        : progressAt(
            drawn.position ? timelineFrom(timeline, drawn.position) : timeline,
            now,
            path.length,
          )
      const vehicleNumber = realtime?.journey.trainNumber
      trips.push({
        key: trip.key,
        line: trip.line.name,
        mode: trip.line.mode,
        pattern: trip.pattern,
        headsign: trip.headsign,
        state,
        source: drawn.source,
        ...fields,
        ...(delay === undefined ? {} : { delay }),
        position: pointAt(path, progress) as [number, number],
        progress: Math.round(progress),
        next: nextCalls(timetable, trip, timed, now),
        ...(atFirstStop ? { waiting: true as const } : {}),
        ...(vehicleNumber ? { vehicleNumber } : {}),
        ...(journey ? { journey } : {}),
      })
    }
  }
  return { trips, unmatched, history: kept }
}
