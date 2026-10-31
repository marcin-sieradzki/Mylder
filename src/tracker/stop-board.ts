// A stop's departures and arrivals from its boards (docs/screens.md, "Stop panel"): one
// `multiDepartureBoard` or `multiArrivalBoard` answer for every platform of the stop, each row
// joined back to its trip in the timetable, by its journey reference and the join's corrections,
// or else by its line, where it goes or comes from, its platform and its planned time, each trip's
// call once, so a row keeps its trip's key and takes its data state from the snapshot. The
// expected time, the track and a cancellation are the board's own. A row whose trip carries
// realtime on the board but has no current realtime on the map is Estimated. A row that joins no
// trip, such as an Extra trip's, is left out, as the map leaves it out. The board's messages are
// the stop's only where they concern it. When no call can be made, or it fails, the stop answers
// from the timetable plus the snapshot's delays, as before.
import 'server-only'
import { Clock, Effect } from 'effect'
import type { DataState } from '../domain/data-state.ts'
import { shownAt, updatedState } from '../domain/departure.ts'
import { platformId } from '../timetable/stops.ts'
import { clockMoment } from '../timetable/time.ts'
import {
  arrivalsAt,
  callsAt,
  DEPARTURES_AHEAD,
  departuresAt,
  listed,
  listedArrivals,
  originOf,
  tripsByKey,
  type Side,
  type FoundStop,
  type SnapshotDelays,
  type StopCall,
  type StopArrival,
  type StopArrivals,
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
import type { History } from './build.ts'
import { joinJourney, type Corrections } from './join.ts'
import { dueBy, type Called, type OnDemand } from './on-demand.ts'
import type {
  Arrival,
  ArrivalBoardAnswer,
  Departure,
  DepartureBoardAnswer,
  Message,
} from './rejseplanen/answers.ts'
import type { RejseplanenShape, DepartureBoardQuery } from './rejseplanen/client.ts'
import { callKey as standingKey, standingAt, type BoardCall } from './standing.ts'
import type { Timetable } from './timetable.ts'

/** A board call for a stop, departures or arrivals: every one of its platforms, over the window. */
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

/** A row of either board: a departure, with where it goes, or an arrival, with where it's from. */
type BoardEntry = Departure | Arrival

/** A board row's line name, as its product gives it. */
const lineOf = (entry: BoardEntry) =>
  entry.ProductAtStop?.line ?? entry.ProductAtStop?.displayNumber ?? entry.Product?.[0]?.line

/** A call's key among the stop's calls: its trip's and its index. */
const callKey = (call: StopCall) => standingKey(call.trip, call.index)

/** The stop's calls by their planned time on `side`, which a board's row is joined at. */
function byPlannedTime(
  calls: readonly StopCall[],
  side: Side,
): ReadonlyMap<number, readonly StopCall[]> {
  const byTime = new Map<number, StopCall[]>()
  for (const call of calls) {
    const at = call.trip.calls[call.index][side]
    byTime.set(at, [...(byTime.get(at) ?? []), call])
  }
  return byTime
}

/** A board row's word on its trip's way: where a departure goes, where an arrival comes from. */
interface Way {
  readonly direction?: string
  readonly origin?: string
}

const departureWay = (departure: Departure): Way => ({ direction: departure.direction })
const arrivalWay = (arrival: Arrival): Way => ({ origin: arrival.origin })

/** Whether a row's way fits a call's trip; what it doesn't say fits any. */
const sameWay = (timetable: Timetable, { direction, origin }: Way, call: StopCall): boolean =>
  (direction === undefined || call.trip.headsign === direction) &&
  (origin === undefined || originOf(timetable, call.trip) === origin)

/**
 * The stop's call a board's row is, of those no earlier row of the board has taken: by its
 * reference's trip, else by its line, its way and its platform, at its planned time either way.
 * Joined, the call is taken.
 */
function joinEntry(
  timetable: Timetable,
  byTime: ReadonlyMap<number, readonly StopCall[]>,
  entry: BoardEntry,
  way: Way,
  planned: number,
  taken: Set<string>,
  corrections: Corrections,
): StopCall | undefined {
  const { platforms } = timetable.stops
  const free = (byTime.get(planned) ?? []).filter((call) => !taken.has(callKey(call)))
  // A trip is taken for the join when its call at this time is: an exact duplicate goes next. An
  // arrival's way is where it comes from, which the join doesn't read.
  const joined = joinJourney(
    timetable,
    { JourneyDetailRef: entry.JourneyDetailRef, direction: way.direction },
    { has: (key) => !free.some((call) => call.trip.key === key) },
    corrections,
  )?.trip
  const line = lineOf(entry)
  const call =
    (joined && free.find((each) => each.trip.key === joined.key)) ||
    (line === undefined
      ? undefined
      : free.find(
          (each) =>
            each.trip.line.name === line &&
            sameWay(timetable, way, each) &&
            platforms[each.trip.calls[each.index].platform].id === platformId(entry.stopExtId),
        ))
  if (call) taken.add(callKey(call))
  return call
}

/**
 * Whether a message a board carries on a row concerns the stop: it names the stop, or it covers
 * the row's call here, `call` when the row joined one, by the stretch of its
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

/** A board's row joined to its call here, with what the board says of it. */
interface JoinedRow {
  readonly call: StopCall
  readonly planned: number
  readonly expected?: number
  readonly track?: string
  readonly cancelled: boolean
  /** The trip's state once the board's realtime is counted. */
  readonly state: DataState
  /** It shows in the window from `now`, at the time its state shows. */
  readonly listed: boolean
}

/**
 * A board's rows on `side` joined to the stop's calls from `now`, each passed to `each` with what
 * the board says of it, and the board's messages that concern the stop, each once: those that name
 * it on any row, and those that cover the call of a row it lists. A row joins its trip as a run's
 * journey does, by the join's `corrections` too.
 */
function readBoard<E extends BoardEntry>(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  stopId: string,
  entries: readonly E[],
  calls: readonly StopCall[],
  {
    now,
    side,
    wayOf,
    corrections,
  }: { now: number; side: Side; wayOf: (entry: E) => Way; corrections: Corrections },
  each: (row: JoinedRow) => void,
): Disruption[] {
  const { timezone } = timetable.manifest
  const byTime = byPlannedTime(calls, side)
  const onMap = tripsByKey(snapshot)
  const taken = new Set<string>()
  const messages = new Map<string, Disruption>()
  const keep = (entry: BoardEntry, call: StopCall | undefined) => {
    for (const message of entry.Messages?.Message ?? []) {
      if (messages.has(message.id) || !concerns(timetable, stopId, message, call)) continue
      messages.set(message.id, disruptionOf(message, timezone))
    }
  }
  for (const entry of entries) {
    const planned = clockMoment(entry.date, entry.time, timezone)
    const call =
      planned === undefined
        ? undefined
        : joinEntry(timetable, byTime, entry, wayOf(entry), planned, taken, corrections)
    if (planned === undefined || !call) {
      keep(entry, undefined)
      continue
    }
    const cancelled = entry.cancelled === true
    // A time with no prognosis has no realtime; Rejseplanen leaves `rtTime` out when it equals
    // the plan.
    const realtime = !cancelled && (entry.rtTime !== undefined || entry.prognosisType !== undefined)
    const expected = realtime
      ? clockMoment(entry.rtDate ?? entry.date, entry.rtTime ?? entry.time, timezone)
      : undefined
    // The board's realtime is an update newer than any position: Estimated where the map has no
    // current realtime for the trip, or doesn't have it at all.
    const onTheMap = onMap.get(call.trip.key)?.state ?? 'timetable-only'
    const state = realtime ? updatedState(onTheMap) : onTheMap
    const track = entry.rtTrack ?? entry.track
    const shown = shownAt({ scheduled: planned, expected }, state)
    const listedHere = shown >= now && shown <= now + DEPARTURES_AHEAD
    keep(entry, listedHere ? call : undefined)
    each({
      call,
      planned,
      ...(expected === undefined ? {} : { expected }),
      ...(track === undefined ? {} : { track }),
      cancelled,
      state,
      listed: listedHere,
    })
  }
  return [...messages.values()]
}

/** A joined row as an answer lists it, with its trip's line and the call's platform. */
function rowOf(timetable: Timetable, row: JoinedRow): StopDeparture {
  const { trip, index } = row.call
  return {
    trip: trip.key,
    line: trip.line.name,
    mode: trip.line.mode,
    colour: trip.line.colour,
    headsign: trip.headsign,
    platform: timetable.stops.platforms[trip.calls[index].platform].id,
    scheduled: row.planned,
    ...(row.expected === undefined ? {} : { expected: row.expected }),
    ...(row.track === undefined ? {} : { track: row.track }),
    ...(row.cancelled ? { cancelled: true as const } : {}),
    state: row.state,
  }
}

/**
 * A found stop's departures from its board, from `now` for the departures' window, soonest first,
 * with the board's messages that concern the stop (`readBoard`), and the trips standing at its
 * platforms with the board's word on their calls.
 */
export function departuresFromBoard(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  { index, stop }: FoundStop,
  board: Called<DepartureBoardAnswer>,
  now: number,
  corrections: Corrections = {},
  history?: History,
): StopDepartures {
  const calls = callsAt(timetable, index, now)
  const rows: StopDeparture[] = []
  // What the board says of each call it joined, in its window or not, for the standing trips.
  const boardCalls = new Map<string, BoardCall>()
  const messages = readBoard(
    timetable,
    snapshot,
    stop.id,
    board.answer.Departure ?? [],
    calls,
    { now, side: 'departure', wayOf: departureWay, corrections },
    (row) => {
      boardCalls.set(callKey(row.call), {
        ...(row.expected === undefined ? {} : { expected: row.expected }),
        ...(row.track === undefined ? {} : { track: row.track }),
        ...(row.cancelled ? { cancelled: true as const } : {}),
        state: row.state,
      })
      if (row.listed) rows.push(rowOf(timetable, row))
    },
  )
  return {
    stop,
    fetched: snapshot.fetched,
    // Due again when the snapshot is, or sooner when the board's minute runs out first.
    nextDue: Math.min(snapshot.nextDue, board.at + 60_000),
    source: { kind: 'rejseplanen', at: board.at },
    standing: standingAt(timetable, snapshot, index, { now, board: boardCalls, history }),
    ...listed(timetable, snapshot, stop, rows, calls, now),
    messages,
  }
}

/**
 * A found stop's arrivals from its arrival board, from `now` for the window, soonest first, each
 * with where its trip comes from as the timetable names it, the interval lines' as intervals, and
 * the board's messages that concern the stop (`readBoard`).
 */
export function arrivalsFromBoard(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  { index, stop }: FoundStop,
  board: Called<ArrivalBoardAnswer>,
  now: number,
  corrections: Corrections = {},
): StopArrivals {
  const calls = callsAt(timetable, index, now, 'arrival')
  const rows: StopArrival[] = []
  const messages = readBoard(
    timetable,
    snapshot,
    stop.id,
    board.answer.Arrival ?? [],
    calls,
    { now, side: 'arrival', wayOf: arrivalWay, corrections },
    (row) => {
      if (!row.listed) return
      rows.push({ ...rowOf(timetable, row), origin: originOf(timetable, row.call.trip) })
    },
  )
  return {
    stop,
    fetched: snapshot.fetched,
    nextDue: Math.min(snapshot.nextDue, board.at + 60_000),
    source: { kind: 'rejseplanen', at: board.at },
    ...listedArrivals(timetable, snapshot, stop, rows, calls, now),
    messages,
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
  /** What the tracker remembers of each trip, for the trips standing at the stop. */
  readonly history: History | undefined
  readonly list: DisruptionList | undefined
  readonly ask: OnDemand
  readonly board: RejseplanenShape['multiDepartureBoard']
  readonly arrivalBoard: RejseplanenShape['multiArrivalBoard']
  /** The join's corrections, read only when the board answers. */
  readonly corrections: Effect.Effect<Corrections>
}

/**
 * A found stop's answer: from its board when an on-demand call is kept or can be made, else from
 * the timetable plus the snapshot's delays; with its messages either way.
 */
export const stopAnswer = (
  { timetable, snapshot, history, list, ask, board, corrections }: StopAnswerInput,
  found: FoundStop,
): Effect.Effect<StopDepartures> =>
  Effect.gen(function* () {
    const { index, stop } = found
    const { called, askAgain } = worthACall(stop)
      ? yield* ask(`stop:${stop.id}`, board(boardQuery(timetable, index)))
      : {}
    const now = yield* Clock.currentTimeMillis
    const answer = called
      ? departuresFromBoard(timetable, snapshot, found, called, now, yield* corrections, history)
      : dueBy(departuresAt(timetable, snapshot, found, { now, history }), askAgain)
    return { ...answer, messages: stopMessages(timetable, stop.id, answer.messages, list) }
  })

/**
 * A found stop's arrivals (docs/screens.md, "Stop panel"): from its arrival board when an on-demand
 * call is kept or can be made, under its own name beside the departure board's, else from the
 * timetable plus the snapshot's delays; with the disruption list's messages that name the stop
 * either way. A stop where only the Metro calls spends no call.
 */
export const stopArrivalsAnswer = (
  {
    timetable,
    snapshot,
    list,
    ask,
    arrivalBoard,
    corrections,
  }: Omit<StopAnswerInput, 'history' | 'board'>,
  found: FoundStop,
): Effect.Effect<StopArrivals> =>
  Effect.gen(function* () {
    const { index, stop } = found
    const { called, askAgain } = worthACall(stop)
      ? yield* ask(`arrivals:${stop.id}`, arrivalBoard(boardQuery(timetable, index)))
      : {}
    const now = yield* Clock.currentTimeMillis
    const answer = called
      ? arrivalsFromBoard(timetable, snapshot, found, called, now, yield* corrections)
      : dueBy(arrivalsAt(timetable, snapshot, found), askAgain)
    return { ...answer, messages: stopMessages(timetable, stop.id, answer.messages, list) }
  })
