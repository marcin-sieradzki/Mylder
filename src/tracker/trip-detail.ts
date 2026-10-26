// A trip's calls from its detail (docs/screens.md, "Vehicle detail"): one `journeyDetail` answer
// for the trip's reference, its calls matched stop by stop on planned times onto the timetable's
// trip (docs/timetable.md, "The join"). When they fit another trip of the day than the one the
// join guessed, the answer is that trip's, and the correction is kept so the next run's join
// takes it. The expected times, the cancellations, Rejseplanen's own delay at the next call and
// the trip's own messages are the detail's; the state stays the snapshot's, for the vehicle the
// viewer opened. When no call can be made, it fails, or the calls fit no trip, the trip answers
// from the timetable plus the snapshot's delay, as before.
import 'server-only'
import { Clock, Effect } from 'effect'
import { clockMoment } from '../timetable/time.ts'
import type { PlannedTrip } from '../timetable/trips.ts'
import {
  plannedTrip,
  tripDetailOf,
  tripsByKey,
  type SnapshotDelays,
  type TripCall,
  type TripDetail,
  type TripMessage,
} from './answers.ts'
import { disruptionOf } from './disruptions.ts'
import { readRef } from './join.ts'
import type { Called, OnDemand } from './on-demand.ts'
import type { JourneyDetailAnswer, Message, Stop } from './rejseplanen/answers.ts'
import type { RejseplanenShape } from './rejseplanen/client.ts'
import type { Timetable } from './timetable.ts'

/** A detail's stop as the match reads it: its Stop's id and its planned times. */
interface PlannedStop {
  readonly stop: string | undefined
  readonly arrival: number | undefined
  readonly departure: number | undefined
  /** A stop the plan doesn't have, which no call matches. */
  readonly additional: boolean
}

const plannedStops = (timetable: Timetable, stops: readonly Stop[]): PlannedStop[] => {
  const { timezone } = timetable.manifest
  return stops.map((stop) => ({
    stop: timetable.stops.stopForPlatform(stop.extId)?.id,
    arrival: clockMoment(stop.arrDate, stop.arrTime, timezone),
    departure: clockMoment(stop.depDate, stop.depTime, timezone),
    additional: stop.additional === true,
  }))
}

/**
 * Where each of a detail's stops falls among a trip's calls, in order, by the call's index, or -1
 * for an additional stop: each at a later call of the same Stop whose timetabled times are the
 * stop's planned ones. Undefined when any other stop finds no such call, or none has a time.
 */
function matchCalls(
  timetable: Timetable,
  trip: PlannedTrip,
  stops: readonly PlannedStop[],
): number[] | undefined {
  const { platforms, stops: stopRecords } = timetable.stops
  const matched: number[] = []
  let from = 0
  let timed = false
  for (const { stop, arrival, departure, additional } of stops) {
    if (additional) {
      matched.push(-1)
      continue
    }
    const i = trip.calls.findIndex(
      (call, j) =>
        j >= from &&
        (arrival === undefined || call.arrival === arrival) &&
        (departure === undefined || call.departure === departure) &&
        stopRecords[platforms[call.platform].stop].id === stop,
    )
    if (i < 0) return undefined
    timed ||= arrival !== undefined || departure !== undefined
    matched.push(i)
    from = i + 1
  }
  return timed ? matched : undefined
}

/** The trip a detail is, and where each of its stops falls among the trip's calls. */
export interface DetailTrip {
  readonly trip: PlannedTrip
  readonly matched: readonly number[]
}

/**
 * The trip a detail's calls fit: the join's guess when they fit it, else another trip of its
 * service day, one of the same line first; undefined when they fit none.
 */
export function tripOfDetail(
  timetable: Timetable,
  guess: PlannedTrip,
  detail: JourneyDetailAnswer,
): DetailTrip | undefined {
  const stops = plannedStops(timetable, detail.Stops.Stop)
  const fits = matchCalls(timetable, guess, stops)
  if (fits) return { trip: guess, matched: fits }
  let other: DetailTrip | undefined
  for (const trip of timetable.tripsOn(guess.serviceDay)) {
    if (trip.key === guess.key) continue
    const matched = matchCalls(timetable, trip, stops)
    if (!matched) continue
    if (trip.line.name === guess.line.name) return { trip, matched }
    other ??= { trip, matched }
  }
  return other
}

/**
 * One side of a detail's stop as an expected time: its realtime one, or the planned one when it
 * has a prognosis, as Rejseplanen leaves the time out when it equals the plan; else none.
 */
function expectedOf(
  timezone: string,
  planned: number,
  date: string | undefined,
  rtDate: string | undefined,
  rtTime: string | undefined,
  prognosis: string | undefined,
): number | undefined {
  if (rtTime !== undefined) return clockMoment(rtDate ?? date, rtTime, timezone)
  return prognosis === undefined ? undefined : planned
}

/** A call with the detail's times and cancellation in place of the snapshot's. */
function callFromStop(
  timezone: string,
  call: TripCall,
  stop: Stop,
  last: number,
  tripCancelled: boolean,
): TripCall {
  const { expectedArrival: _a, expectedDeparture: _d, cancelled: _c, ...planned } = call
  // Cancelled when every side the call has is: the first only departs, the last only arrives.
  const cancelled =
    (call.index === 0 || stop.cancelledArrival === true) &&
    (call.index === last || stop.cancelledDeparture === true)
  if (cancelled) return { ...planned, cancelled: true }
  // A trip called off whole keeps its calls, marked on the trip, with no times expected.
  if (tripCancelled) return planned
  const arrival = expectedOf(
    timezone,
    call.arrival,
    stop.arrDate,
    stop.rtArrDate,
    stop.rtArrTime,
    stop.arrPrognosisType,
  )
  const departure = expectedOf(
    timezone,
    call.departure,
    stop.depDate,
    stop.rtDepDate,
    stop.rtDepTime,
    stop.depPrognosisType,
  )
  return {
    ...planned,
    ...(arrival === undefined ? {} : { expectedArrival: arrival }),
    ...(departure === undefined ? {} : { expectedDeparture: departure }),
  }
}

/**
 * The first and last of a trip's calls a message covers: by the detail's own call indexes when
 * it gives them, else by the stops its stretch starts and ends at, else by the stops it affects.
 */
function coveredCalls(
  timetable: Timetable,
  trip: PlannedTrip,
  detail: JourneyDetailAnswer,
  matched: readonly number[],
  message: Message,
): TripMessage['calls'] {
  const covered: number[] = []
  if (message.routeIdxFrom !== undefined && message.routeIdxTo !== undefined) {
    const stops = detail.Stops.Stop
    const callAt = (routeIdx: number) => {
      const s = stops.findIndex((stop, i) => (stop.routeIdx ?? i) === routeIdx)
      return s < 0 ? -1 : matched[s]
    }
    covered.push(callAt(message.routeIdxFrom), callAt(message.routeIdxTo))
  } else {
    const ends = [message.validFromStop, message.validToStop].flatMap((stop) => stop ?? [])
    const named = new Set(
      (ends.length > 0 ? ends : (message.affectedStops?.StopLocation ?? [])).map(
        ({ extId }) => timetable.stops.stopForPlatform(extId)?.id,
      ),
    )
    const { platforms, stops } = timetable.stops
    trip.calls.forEach((call, i) => {
      if (named.has(stops[platforms[call.platform].stop].id)) covered.push(i)
    })
  }
  const known = covered.filter((i) => i >= 0)
  if (known.length === 0) return undefined
  return { first: Math.min(...known), last: Math.max(...known) }
}

/**
 * A trip's answer from its detail, at a moment, for the trip the join guessed: the trip the
 * detail's calls fit, with the snapshot's state and delay for the guess, the vehicle the viewer
 * opened, and the detail's times, cancellations and messages; undefined when they fit no trip.
 */
export function tripFromDetail(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  guess: PlannedTrip,
  called: Called<JourneyDetailAnswer>,
  now: number,
): TripDetail | undefined {
  const detail = called.answer
  const found = tripOfDetail(timetable, guess, detail)
  if (!found) return undefined
  const { trip, matched } = found
  const { timezone } = timetable.manifest
  const onMap = tripsByKey(snapshot)
  const live = onMap.get(guess.key) ?? onMap.get(trip.key)
  const base = tripDetailOf(timetable, snapshot, trip, live, now)
  const tripCancelled = detail.cancelled === true
  const stopAt = new Map<number, Stop>()
  matched.forEach((index, s) => {
    if (index >= 0) stopAt.set(index, detail.Stops.Stop[s])
  })
  const last = trip.calls.length - 1
  const calls = base.calls.map((call) => {
    const stop = stopAt.get(call.index)
    return stop ? callFromStop(timezone, call, stop, last, tripCancelled) : call
  })
  // The next call it will make, by the time it is expected there or else timetabled: the
  // departure, or the arrival at the last stop.
  const side = (call: TripCall) =>
    call.index === last
      ? { planned: call.arrival, expected: call.expectedArrival }
      : { planned: call.departure, expected: call.expectedDeparture }
  const next = calls.find((call) => {
    const { planned, expected } = side(call)
    return !call.cancelled && (expected ?? planned) > now
  })
  const nextSide = next && stopAt.has(next.index) ? side(next) : undefined
  const expectedNext =
    nextSide?.expected === undefined ? undefined : nextSide.expected - nextSide.planned
  const seen = new Set<string>()
  const messages: TripMessage[] = []
  for (const message of detail.Messages?.Message ?? []) {
    if (seen.has(message.id)) continue
    seen.add(message.id)
    const covered = coveredCalls(timetable, trip, detail, matched, message)
    messages.push({ ...disruptionOf(message, timezone), ...(covered ? { calls: covered } : {}) })
  }
  // Times of its own lift the interval rule for its line, as a board row's do (ADR 0006).
  const realtime = calls.some(
    (call) =>
      stopAt.has(call.index) &&
      (call.expectedArrival !== undefined || call.expectedDeparture !== undefined),
  )
  const { runsToInterval: _rule, interval: _interval, ...timed } = base
  return {
    ...(realtime ? timed : base),
    ...(expectedNext === undefined ? {} : { nextCallDelay: Math.round(expectedNext / 1000) }),
    ...(tripCancelled ? { cancelled: true as const } : {}),
    // Due again when the snapshot is, or sooner when the detail's minute runs out first.
    nextDue: Math.min(snapshot.nextDue, called.at + 60_000),
    source: { kind: 'rejseplanen', at: called.at },
    calls,
    messages,
  }
}

export interface TripAnswerInput {
  readonly timetable: Timetable
  readonly snapshot: SnapshotDelays
  readonly ask: OnDemand
  readonly detail: RejseplanenShape['journeyDetail']
  /** The trip's journey reference, from what the tracker remembers of it, if any answer had it. */
  readonly refOf: (tripKey: string) => Effect.Effect<string | undefined>
  /** Keeps a correction of the join: Rejseplanen's journey, `ZI@DA`, is this trip. */
  readonly correct: (journey: string, tripKey: string) => Effect.Effect<void>
}

/**
 * A trip's answer: from its detail when an on-demand call for its reference is kept or can be
 * made and its calls fit a trip, else from the timetable plus the snapshot's delay. A trip no
 * answer has carried has no reference, and so no call. Undefined for a trip not running now.
 */
export const tripAnswer = (
  { timetable, snapshot, ask, detail, refOf, correct }: TripAnswerInput,
  tripKey: string,
): Effect.Effect<TripDetail | undefined> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    const guess = plannedTrip(timetable, tripKey, now)
    if (!guess) return undefined
    const ref = yield* refOf(guess.key)
    const called = ref === undefined ? undefined : yield* ask(`trip:${guess.key}`, detail({ ref }))
    const answer = called && tripFromDetail(timetable, snapshot, guess, called, now)
    if (!answer)
      return tripDetailOf(timetable, snapshot, guess, tripsByKey(snapshot).get(guess.key), now)
    // Only a journey with a number can be told apart from the rest of its day.
    const journey = ref === undefined ? undefined : readRef(ref)?.journey
    if (answer.key !== guess.key && journey !== undefined && !journey.startsWith('@')) {
      yield* correct(journey, answer.key)
    }
    return answer
  })
