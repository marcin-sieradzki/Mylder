// A stop's departures from its board (docs/screens.md, "Stop departures"): one
// `multiDepartureBoard` answer for every platform of the stop, each departure joined back to its
// trip in the timetable, by its journey reference or else by its line, way, platform and planned
// time, each trip's call once, so a row keeps its trip's key and takes its data state from the
// snapshot. The expected time, the track and a cancellation are the board's own. A row whose trip
// carries realtime on the board but has no current realtime on the map is Estimated. A departure that joins no trip, such as an Extra trip, is left
// out, as the map leaves it out. When no call can be made, or it fails, the stop answers from
// the timetable plus the snapshot's delays, as before.
import 'server-only'
import { Clock, Effect } from 'effect'
import { shownAt, updatedState } from '../domain/departure.ts'
import { platformId } from '../timetable/stops.ts'
import { clockMoment } from '../timetable/time.ts'
import type { PlannedTrip } from '../timetable/trips.ts'
import {
  DEPARTURES_AHEAD,
  stopDeparturesFrom,
  stopIndexOf,
  stopOf,
  tripsByKey,
  type SnapshotDelays,
  type StopDeparture,
  type StopDepartures,
  listed,
} from './answers.ts'
import { disruptionOf, namesStop, type Disruption, type DisruptionList } from './disruptions.ts'
import { joinJourney } from './join.ts'
import { dueBy, type Called, type OnDemand } from './on-demand.ts'
import type { Departure, DepartureBoardAnswer, Message } from './rejseplanen/answers.ts'
import type { RejseplanenShape, DepartureBoardQuery } from './rejseplanen/client.ts'
import type { Timetable } from './timetable.ts'

/** The board call for a stop: every one of its platforms, over the departures' window. */
export function boardQuery(timetable: Timetable, stopIndex: number): DepartureBoardQuery {
  return {
    ids: timetable.stops.platforms.flatMap((p) => (p.stop === stopIndex ? [p.id] : [])),
    duration: DEPARTURES_AHEAD / 60_000,
  }
}

/**
 * Whether a stop is worth a call: some line that calls at it isn't an interval line. The Metro's
 * rows never spend one (ADR 0006).
 */
export const worthACall = (stop: StopDepartures['stop']) =>
  stop.lines.some((line) => line.mode !== 'metro')

/** One call of a trip at the stop, by the trip and the call's index. */
interface StopCall {
  readonly trip: PlannedTrip
  readonly index: number
}

/** Every departing call at the stop's platforms on the service days running at a moment. */
function callsAt(timetable: Timetable, stopIndex: number, now: number): StopCall[] {
  const { platforms } = timetable.stops
  const calls: StopCall[] = []
  for (const day of timetable.serviceDaysAt(now)) {
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

/** A departure's line name, as its product gives it. */
const lineOf = (departure: Departure) =>
  departure.ProductAtStop?.line ??
  departure.ProductAtStop?.displayNumber ??
  departure.Product?.[0]?.line

/** A call's key among the stop's calls: its trip's and its index. */
const callKey = (call: StopCall) => `${call.trip.key} ${call.index}`

/**
 * The stop's call a departure is, of those no earlier departure of the board has taken: by its
 * reference's trip, else by its line, its way and its platform, at its planned time either way.
 * Joined, the call is taken.
 */
function joinDeparture(
  timetable: Timetable,
  calls: readonly StopCall[],
  departure: Departure,
  planned: number,
  taken: Set<string>,
): StopCall | undefined {
  const { platforms } = timetable.stops
  const free = calls.filter(
    (call) => call.trip.calls[call.index].departure === planned && !taken.has(callKey(call)),
  )
  // A trip is taken for the join when its call at this time is: an exact duplicate goes next.
  const joined = joinJourney(timetable, departure, {
    has: (key) => !free.some((call) => call.trip.key === key),
  })?.trip
  const line = lineOf(departure)
  const call =
    (joined && free.find((each) => each.trip.key === joined.key)) ||
    (line === undefined
      ? undefined
      : free.find(
          (each) =>
            each.trip.line.name === line &&
            (departure.direction === undefined || each.trip.headsign === departure.direction) &&
            platforms[each.trip.calls[each.index].platform].id === platformId(departure.stopExtId),
        ))
  if (call) taken.add(callKey(call))
  return call
}

/**
 * A stop's departures from its board, from `now` for the departures' window, soonest first;
 * undefined for a stop the timetable doesn't know.
 */
export function departuresFromBoard(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  stopId: string,
  board: Called<DepartureBoardAnswer>,
  now: number,
): StopDepartures | undefined {
  const stopIndex = stopIndexOf(timetable, stopId)
  if (stopIndex < 0) return undefined
  const { timezone } = timetable.manifest
  const { platforms } = timetable.stops
  const calls = callsAt(timetable, stopIndex, now)
  const onMap = tripsByKey(snapshot)
  const rows: StopDeparture[] = []
  const taken = new Set<string>()
  for (const departure of board.answer.Departure ?? []) {
    const planned = clockMoment(departure.date, departure.time, timezone)
    if (planned === undefined) continue
    const call = joinDeparture(timetable, calls, departure, planned, taken)
    if (!call) continue
    const { trip, index } = call
    const cancelled = departure.cancelled === true
    // A time with no prognosis has no realtime; Rejseplanen leaves `rtTime` out when it equals
    // the plan.
    const realtime =
      !cancelled && (departure.rtTime !== undefined || departure.prognosisType !== undefined)
    const expected = realtime
      ? clockMoment(
          departure.rtDate ?? departure.date,
          departure.rtTime ?? departure.time,
          timezone,
        )
      : undefined
    // The board's realtime is an update newer than any position: Estimated where the map has no
    // current realtime for the trip, or doesn't have it at all.
    const onTheMap = onMap.get(trip.key)?.state ?? 'timetable-only'
    const state = realtime ? updatedState(onTheMap) : onTheMap
    const leaves = shownAt({ scheduled: planned, expected }, state)
    if (leaves < now || leaves > now + DEPARTURES_AHEAD) continue
    const track = departure.rtTrack ?? departure.track
    rows.push({
      trip: trip.key,
      line: trip.line.name,
      mode: trip.line.mode,
      colour: trip.line.colour,
      headsign: trip.headsign,
      platform: platforms[trip.calls[index].platform].id,
      scheduled: planned,
      ...(expected === undefined ? {} : { expected }),
      ...(track === undefined ? {} : { track }),
      ...(cancelled ? { cancelled: true as const } : {}),
      state,
    })
  }
  const stop = stopOf(timetable, stopIndex)
  return {
    stop,
    fetched: snapshot.fetched,
    // Due again when the snapshot is, or sooner when the board's minute runs out first.
    nextDue: Math.min(snapshot.nextDue, board.at + 60_000),
    source: { kind: 'rejseplanen', at: board.at },
    ...listed(timetable, snapshot, stop, rows, now),
    messages: [],
  }
}

/**
 * A stop's messages, each once: those on its board's departures, then those in the disruption
 * list that name the stop, as received.
 */
export function stopMessages(
  timetable: Timetable,
  stopId: string,
  board: DepartureBoardAnswer | undefined,
  list: DisruptionList | undefined,
): Disruption[] {
  const { timezone } = timetable.manifest
  const fromBoard: Message[] = (board?.Departure ?? []).flatMap(
    (departure) => departure.Messages?.Message ?? [],
  )
  const seen = new Set<string>()
  const messages: Disruption[] = []
  for (const message of fromBoard) {
    if (seen.has(message.id)) continue
    seen.add(message.id)
    messages.push(disruptionOf(message, timezone))
  }
  for (const disruption of list?.messages ?? []) {
    if (seen.has(disruption.message.id)) continue
    if (!namesStop(disruption.message, timetable.stops, stopId)) continue
    seen.add(disruption.message.id)
    messages.push(disruption)
  }
  return messages
}

export interface StopAnswerInput {
  readonly timetable: Timetable
  readonly snapshot: SnapshotDelays
  readonly list: DisruptionList | undefined
  readonly ask: OnDemand
  readonly board: RejseplanenShape['multiDepartureBoard']
}

/**
 * A stop's answer: from its board when an on-demand call is kept or can be made, else from the
 * timetable plus the snapshot's delays; with its messages either way. Undefined for a stop the
 * timetable doesn't know.
 */
export const stopAnswer = (
  { timetable, snapshot, list, ask, board }: StopAnswerInput,
  stopId: string,
): Effect.Effect<StopDepartures | undefined> =>
  Effect.gen(function* () {
    const stopIndex = stopIndexOf(timetable, stopId)
    if (stopIndex < 0) return undefined
    const stop = stopOf(timetable, stopIndex)
    const { called, askAgain } = worthACall(stop)
      ? yield* ask(`stop:${stop.id}`, board(boardQuery(timetable, stopIndex)))
      : {}
    const now = yield* Clock.currentTimeMillis
    // The timetable's answer only when the board's is missing.
    const answer =
      (called && departuresFromBoard(timetable, snapshot, stopId, called, now)) ||
      dueBy(stopDeparturesFrom(timetable, snapshot, stopId)!, askAgain)
    return { ...answer, messages: stopMessages(timetable, stop.id, called?.answer, list) }
  })
