// A stop's departures from its board (docs/screens.md, "Stop departures"): one
// `multiDepartureBoard` answer for every platform of the stop, each departure joined back to its
// trip in the timetable, by its journey reference or else by its line and planned time, so a row
// keeps its trip's key and takes its data state from the snapshot. The expected time, the track
// and a cancellation are the board's own. A row whose trip carries realtime on the board but has
// none on the map is Estimated. A departure that joins no trip, such as an Extra trip, is left
// out, as the map leaves it out. When no call can be made, or it fails, the stop answers from
// the timetable plus the snapshot's delays, as before.
import 'server-only'
import { Clock, Effect } from 'effect'
import { clockMoment } from '../timetable/time.ts'
import type { PlannedTrip } from '../timetable/trips.ts'
import {
  DEPARTURES_AHEAD,
  MAX_DEPARTURES,
  stopDeparturesFrom,
  stopIndexOf,
  stopOf,
  tripsByKey,
  type SnapshotDelays,
  type StopDeparture,
  type StopDepartures,
} from './answers.ts'
import { disruptionOf, namesStop, type Disruption, type DisruptionList } from './disruptions.ts'
import { joinJourney } from './join.ts'
import type { Called, OnDemand } from './on-demand.ts'
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
 * Whether a stop's timetable answer is worth a call: some departure is on a line that isn't an
 * interval line. The Metro's rows never spend one (ADR 0006).
 */
export const worthACall = (answer: StopDepartures) =>
  answer.departures.some((departure) => departure.mode !== 'metro')

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

/**
 * The stop's call a departure is: by its reference's trip and planned time, else by its line and
 * planned time among the stop's calls.
 */
function joinDeparture(
  timetable: Timetable,
  calls: readonly StopCall[],
  departure: Departure,
  planned: number,
): StopCall | undefined {
  const joined = joinJourney(timetable, departure)?.trip
  const at = (call: StopCall) => call.trip.calls[call.index].departure === planned
  if (joined) {
    const call = calls.find((each) => each.trip.key === joined.key && at(each))
    if (call) return call
  }
  const line = lineOf(departure)
  return line === undefined
    ? undefined
    : calls.find((each) => each.trip.line.name === line && at(each))
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
  for (const departure of board.answer.Departure ?? []) {
    const planned = clockMoment(departure.date, departure.time, timezone)
    if (planned === undefined) continue
    const call = joinDeparture(timetable, calls, departure, planned)
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
    const leaves = expected ?? planned
    if (leaves < now || leaves > now + DEPARTURES_AHEAD) continue
    const live = onMap.get(trip.key)
    const state =
      live && !(realtime && live.state === 'timetable-only')
        ? live.state
        : realtime
          ? 'estimated'
          : 'timetable-only'
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
  rows.sort((a, b) => (a.expected ?? a.scheduled) - (b.expected ?? b.scheduled))
  return {
    stop: stopOf(timetable, stopIndex),
    fetched: snapshot.fetched,
    // Due again when the snapshot is, or sooner when the board's minute runs out first.
    nextDue: Math.min(snapshot.nextDue, board.at + 60_000),
    source: { kind: 'rejseplanen', at: board.at },
    departures: rows.slice(0, MAX_DEPARTURES),
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
    const planned = stopDeparturesFrom(timetable, snapshot, stopId)
    if (!planned) return undefined
    const stopIndex = stopIndexOf(timetable, stopId)
    const called = worthACall(planned)
      ? yield* ask(`stop:${planned.stop.id}`, board(boardQuery(timetable, stopIndex)))
      : undefined
    const now = yield* Clock.currentTimeMillis
    const answer =
      (called && departuresFromBoard(timetable, snapshot, stopId, called, now)) || planned
    return { ...answer, messages: stopMessages(timetable, planned.stop.id, called?.answer, list) }
  })
