// Building the snapshot's trips: every trip the timetable puts on the map at a moment, joined to
// the journeys of a `journeyPos` answer, each placed on its path and given its data state by the
// domain rules (docs/data-states.md). Plain functions over the timetable; the run in
// `tracker.ts` supplies the moment, the answer and the health.
import 'server-only'
import { dataState, type ApiHealth, type DataStateContext } from '../domain/data-state.ts'
import {
  delayOf,
  pointAt,
  progressAt,
  snapToPath,
  timedCalls,
  timelineOf,
  tripAt,
  tripPhase,
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

export interface BuildInput {
  readonly timetable: Timetable
  readonly now: number
  readonly answer?: PositionAnswer
  readonly context: Omit<DataStateContext, 'now' | 'fetched'> & { readonly health: ApiHealth }
}

export interface Built {
  readonly trips: SnapshotTrip[]
  readonly unmatched: number
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
 * The snapshot's trips: every trip the timetable puts on the map at the moment, and every
 * journey of the answer joined to its trip. A journey no trip fits is counted, not drawn.
 */
export function buildTrips({ timetable, now, answer, context }: BuildInput): Built {
  const joined = new Map<string, { journey: PositionJourney; ref: string }>()
  let unmatched = 0
  for (const journey of answer?.journeys ?? []) {
    const match = joinJourney(timetable, journey, joined)
    if (match) joined.set(match.trip.key, { journey, ref: match.ref.journey })
    else unmatched++
  }
  const ctx: DataStateContext = { ...context, now, fetched: now }
  const trips: SnapshotTrip[] = []
  for (const day of timetable.serviceDaysAt(now)) {
    for (const trip of timetable.tripsOn(day)) {
      const realtime = joined.get(trip.key)
      if (!realtime && !onMap(tripPhase(trip.calls, now))) continue
      const path = timetable.pathOf(trip.pattern)
      const calls = realtime
        ? callsWithStops(timetable, trip, realtime.journey.Stops?.Stop)
        : trip.calls
      const delay = realtime ? delayOf(calls) : undefined
      const timed = timedCalls(calls)
      // A journey on its expected times outside the trip's window (more than 5 min before it
      // leaves, or arrived) is joined but not drawn, like any trip off the map.
      if (realtime && !onMap(tripPhase(timed, now))) continue
      let progress: number
      const waiting = now < timed[0].departure
      if (realtime && waiting) {
        // A Waiting trip stands at its first stop, wherever its report puts it on the platform.
        progress = 0
      } else if (realtime) {
        const hint = progressAt(timelineOf(timed, path), now, path.length)
        progress = snapToPath(path, [realtime.journey.lat, realtime.journey.lon], hint)
      } else {
        const place = tripAt(timed, path, now)
        if (!place) continue
        progress = place.progress
      }
      const reported = realtime && answer?.mode === 'REPORT_ONLY'
      const fields = {
        ...(realtime ? { seen: now } : {}),
        ...(reported ? { reported: now } : {}),
        hadRealtime: realtime !== undefined,
      }
      const vehicleNumber = realtime?.journey.trainNumber
      trips.push({
        key: trip.key,
        line: trip.line.name,
        mode: trip.line.mode,
        pattern: trip.pattern,
        headsign: trip.headsign,
        state: dataState(fields, ctx),
        source: realtime ? (reported ? 'reported' : 'computed') : 'timetable',
        ...fields,
        ...(delay === undefined ? {} : { delay }),
        position: pointAt(path, progress) as [number, number],
        progress: Math.round(progress),
        next: nextCalls(timetable, trip, timed, now),
        ...(waiting ? { waiting: true as const } : {}),
        ...(vehicleNumber ? { vehicleNumber } : {}),
        ...(realtime ? { journey: realtime.ref } : {}),
      })
    }
  }
  return { trips, unmatched }
}
