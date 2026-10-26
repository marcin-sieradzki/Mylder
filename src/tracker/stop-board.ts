// A stop's departures from its board (docs/screens.md, "Stop departures"): one
// `multiDepartureBoard` answer for every platform of the stop, each departure joined back to its
// trip in the timetable, by its journey reference or else by its line, way, platform and planned
// time, each trip's call once, so a row keeps its trip's key and takes its data state from the
// snapshot. The expected time, the track and a cancellation are the board's own. A row whose trip
// carries realtime on the board but has no current realtime on the map is Estimated. A departure
// that joins no trip, such as an Extra trip, is left out, as the map leaves it out. The board's
// messages are the stop's only where they concern it. When no call can be made, or it fails, the
// stop answers from the timetable plus the snapshot's delays, as before.
import 'server-only'
import { Clock, Effect } from 'effect'
import { shownAt, updatedState } from '../domain/departure.ts'
import { platformId } from '../timetable/stops.ts'
import { clockMoment } from '../timetable/time.ts'
import {
  callsAt,
  DEPARTURES_AHEAD,
  departuresAt,
  listed,
  tripsByKey,
  type FoundStop,
  type SnapshotDelays,
  type StopCall,
  type StopDeparture,
  type StopDepartures,
} from './answers.ts'
import {
  disruptionOf,
  namedStops,
  namesStop,
  type Disruption,
  type DisruptionList,
} from './disruptions.ts'
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

/** A departure's line name, as its product gives it. */
const lineOf = (departure: Departure) =>
  departure.ProductAtStop?.line ??
  departure.ProductAtStop?.displayNumber ??
  departure.Product?.[0]?.line

/** A call's key among the stop's calls: its trip's and its index. */
const callKey = (call: StopCall) => `${call.trip.key} ${call.index}`

/** The stop's calls by their planned departure, which a board's departure is joined at. */
function byPlannedTime(calls: readonly StopCall[]): ReadonlyMap<number, readonly StopCall[]> {
  const byTime = new Map<number, StopCall[]>()
  for (const call of calls) {
    const at = call.trip.calls[call.index].departure
    byTime.set(at, [...(byTime.get(at) ?? []), call])
  }
  return byTime
}

/**
 * The stop's call a departure is, of those no earlier departure of the board has taken: by its
 * reference's trip, else by its line, its way and its platform, at its planned time either way.
 * Joined, the call is taken.
 */
function joinDeparture(
  timetable: Timetable,
  byTime: ReadonlyMap<number, readonly StopCall[]>,
  departure: Departure,
  planned: number,
  taken: Set<string>,
): StopCall | undefined {
  const { platforms } = timetable.stops
  const free = (byTime.get(planned) ?? []).filter((call) => !taken.has(callKey(call)))
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
 * Whether a message a board carries on a departure concerns the stop: it names the stop, or it
 * covers the departure's call here, `call` when the departure joined one, by the stretch of its
 * trip it gives (Rejseplanen's route indexes, which count the trip's calls, kept whole by the
 * timetable) or, giving neither stops nor a stretch, as the whole trip's.
 */
function concerns(
  timetable: Timetable,
  stopId: string,
  message: Message,
  call: StopCall | undefined,
): boolean {
  if (namesStop(message, timetable.stops, stopId)) return true
  if (!call) return false
  const { routeIdxFrom: from, routeIdxTo: to } = message
  if (from !== undefined && to !== undefined) return from <= call.index && call.index <= to
  return namedStops(message).length === 0
}

/**
 * A found stop's departures from its board, from `now` for the departures' window, soonest first,
 * with the board's messages that concern the stop, each once: those that name it on any
 * departure, and those that cover the call of a departure it lists.
 */
export function departuresFromBoard(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  { index, stop }: FoundStop,
  board: Called<DepartureBoardAnswer>,
  now: number,
): StopDepartures {
  const { timezone } = timetable.manifest
  const { platforms } = timetable.stops
  const calls = callsAt(timetable, index, now)
  const byTime = byPlannedTime(calls)
  const onMap = tripsByKey(snapshot)
  const rows: StopDeparture[] = []
  const taken = new Set<string>()
  const messages = new Map<string, Disruption>()
  const keep = (departure: Departure, call: StopCall | undefined) => {
    for (const message of departure.Messages?.Message ?? []) {
      if (messages.has(message.id) || !concerns(timetable, stop.id, message, call)) continue
      messages.set(message.id, disruptionOf(message, timezone))
    }
  }
  for (const departure of board.answer.Departure ?? []) {
    const planned = clockMoment(departure.date, departure.time, timezone)
    const call =
      planned === undefined
        ? undefined
        : joinDeparture(timetable, byTime, departure, planned, taken)
    if (planned === undefined || !call) {
      keep(departure, undefined)
      continue
    }
    const { trip, index: i } = call
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
    const listedHere = leaves >= now && leaves <= now + DEPARTURES_AHEAD
    keep(departure, listedHere ? call : undefined)
    if (!listedHere) continue
    const track = departure.rtTrack ?? departure.track
    rows.push({
      trip: trip.key,
      line: trip.line.name,
      mode: trip.line.mode,
      colour: trip.line.colour,
      headsign: trip.headsign,
      platform: platforms[trip.calls[i].platform].id,
      scheduled: planned,
      ...(expected === undefined ? {} : { expected }),
      ...(track === undefined ? {} : { track }),
      ...(cancelled ? { cancelled: true as const } : {}),
      state,
    })
  }
  return {
    stop,
    fetched: snapshot.fetched,
    // Due again when the snapshot is, or sooner when the board's minute runs out first.
    nextDue: Math.min(snapshot.nextDue, board.at + 60_000),
    source: { kind: 'rejseplanen', at: board.at },
    ...listed(timetable, snapshot, stop, rows, calls, now),
    messages: [...messages.values()],
  }
}

/**
 * A stop's messages, each once: those its answer has from its board, then those in the
 * disruption list that name the stop, as received.
 */
function stopMessages(
  timetable: Timetable,
  stopId: string,
  fromBoard: readonly Disruption[],
  list: DisruptionList | undefined,
): Disruption[] {
  const seen = new Set(fromBoard.map(({ message }) => message.id))
  const messages = [...fromBoard]
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
 * A found stop's answer: from its board when an on-demand call is kept or can be made, else from
 * the timetable plus the snapshot's delays; with its messages either way.
 */
export const stopAnswer = (
  { timetable, snapshot, list, ask, board }: StopAnswerInput,
  found: FoundStop,
): Effect.Effect<StopDepartures> =>
  Effect.gen(function* () {
    const { index, stop } = found
    const { called, askAgain } = worthACall(stop)
      ? yield* ask(`stop:${stop.id}`, board(boardQuery(timetable, index)))
      : {}
    const now = yield* Clock.currentTimeMillis
    const answer = called
      ? departuresFromBoard(timetable, snapshot, found, called, now)
      : dueBy(departuresAt(timetable, snapshot, found), askAgain)
    return { ...answer, messages: stopMessages(timetable, stop.id, answer.messages, list) }
  })
