// What a vehicle's detail says of it (docs/screens.md, "Vehicle detail"): the one line its state
// means, its facts, where it is in words, its stops and where their times came from, worked out
// from the trip route's answer, the snapshot's trip and the clock. Words only: the panel lays them
// out. Times read on the clock of the timetable's zone.
import type { DataState } from '../domain/data-state.ts'
import { tripPhase, type TimedCall } from '../domain/trip-motion.ts'
import type { ClientDictionary } from '../i18n/dictionary.ts'
import type { Where } from '../map/where.ts'
import { clockTime } from '../timetable/time.ts'
import type { SnapshotTrip, TripCall, TripDetail, TripMessage } from '../tracker/index.ts'
import { fill } from './vehicleLabel.ts'

type Words = ClientDictionary['trip']

/** The struck or "~" expected time shows from a minute's difference, as on a departure row. */
const EXPECTED_FROM = 60_000

/**
 * Whether the trip runs to an interval rather than its clock times, as its answer says by the rule
 * its stops' departures follow (ADR 0006): a Metro line until any of its trips has realtime.
 */
export const runsToInterval = (detail: TripDetail): boolean => detail.runsToInterval === true

/** The times the trip keeps at each call: the expected ones where it has them, else the plan's. */
export const timedCallsOf = (detail: TripDetail): TimedCall[] =>
  detail.calls.map((call) => ({
    arrival: call.expectedArrival ?? call.arrival,
    departure: call.expectedDeparture ?? call.departure,
  }))

/**
 * The trip's delay in seconds, as its panel gives it: Rejseplanen's own at the next call, from the
 * trip's detail, else the answer's snapshot's, else the snapshot's now, which may be newer.
 */
export const shownDelayOf = (
  detail: TripDetail,
  trip: SnapshotTrip | undefined,
): number | undefined => detail.nextCallDelay ?? detail.delay ?? trip?.delay

/** A delay in seconds as whole minutes with their sign, "+3 min", "−1 min" or "0 min". */
function signedMinutes(delay: number, words: Words): string {
  const minutes = Math.round(delay / 60)
  const sign = minutes > 0 ? '+' : minutes < 0 ? '−' : ''
  return `${sign}${fill(words.minutes, { minutes: Math.abs(minutes) })}`
}

export interface StateInput {
  readonly detail: TripDetail
  /** The trip as the snapshot carries it, while it is on the map. */
  readonly trip: SnapshotTrip | undefined
  readonly state: DataState
  readonly timezone: string
  readonly words: Words
}

/**
 * The one line that says what the trip's state means, such as "Reported by the vehicle; seen
 * 08:14:05"; none where the snapshot no longer carries the time it would give.
 */
export function stateSentence({ detail, trip, state, timezone, words }: StateInput) {
  if (detail.cancelled) return words.cancelled
  if (runsToInterval(detail)) return words.interval
  const at = (moment: number | undefined, seconds = false) =>
    moment === undefined ? undefined : clockTime(moment, timezone, { seconds })
  switch (state) {
    case 'live': {
      const time = at(trip?.reported, true)
      return time === undefined ? undefined : fill(words.live, { time })
    }
    case 'ageing': {
      const time = at(trip?.reported)
      return time === undefined ? undefined : fill(words.ageing, { time })
    }
    case 'estimated': {
      if (trip?.source === 'computed') return words.computed
      const delay = shownDelayOf(detail, trip) ?? 0
      return fill(words.estimatedDelay, { delay: signedMinutes(delay, words) })
    }
    case 'timetable-only':
      return words.timetableOnly
    case 'no-signal': {
      const time = at(trip?.seen ?? trip?.reported ?? trip?.updated)
      return time === undefined ? undefined : fill(words.noSignal, { time })
    }
  }
}

/**
 * The index of the trip's next call: the snapshot's while it is on the map, else where its times
 * put it at `now`; past the last once it has arrived, and none for a cancelled trip.
 */
export function nextCallOf(
  detail: TripDetail,
  trip: SnapshotTrip | undefined,
  now: number,
): number | undefined {
  if (detail.cancelled) return undefined
  if (trip) return trip.waiting ? 0 : (trip.next[0]?.index ?? detail.calls.length)
  const calls = timedCallsOf(detail)
  switch (tripPhase(calls, now)) {
    case 'upcoming':
    case 'waiting':
      return 0
    case 'finished':
      return calls.length
    case 'underway': {
      const next = calls.findIndex((call) => call.departure > now)
      return next < 0 ? calls.length - 1 : next
    }
  }
}

/** Where the trip is, in words, naming its stops as its calls do. */
export function whereWords(where: Where, detail: TripDetail, timezone: string, words: Words) {
  const name = (stop: number) => detail.calls[stop]?.name ?? ''
  switch (where.kind) {
    case 'waiting':
      return fill(words.waiting, {
        stop: name(where.stop),
        time: clockTime(where.departs, timezone),
      })
    case 'at':
      return fill(words.at, { stop: name(where.stop) })
    case 'between':
      return fill(words.between, { from: name(where.from), to: name(where.to) })
    case 'near':
      return fill(words.near, { stop: name(where.stop) })
  }
}

/** An interval in words: "Every 4 min", or "Every 3 to 4 min". */
export const intervalWords = (interval: NonNullable<TripDetail['interval']>, words: Words) =>
  interval.from === interval.to
    ? fill(words.every, { minutes: interval.from })
    : fill(words.everyRange, { from: interval.from, to: interval.to })

/** One stop of the trip as StopTimeline takes it. */
export interface TimelineStop {
  readonly name: string
  readonly time?: string
  readonly expected?: string
  readonly delay?: number | null
  readonly cancelled?: boolean
}

/**
 * A call's name with a note for each of `messages` whose stretch of the trip starts or ends
 * there, "Sydhavn St. — Langsom kørsel from here", so the list marks the stops a card covers.
 */
function notedName(call: TripCall, messages: readonly TripMessage[], words: Words): string {
  let name = call.name
  for (const { message, calls } of messages) {
    if (!calls) continue
    const note =
      calls.first === calls.last
        ? call.index === calls.first && words.rangeAt
        : (call.index === calls.first && words.rangeFrom) ||
          (call.index === calls.last && words.rangeTo)
    if (note) name = fill(note, { stop: name, head: message.head })
  }
  return name
}

/** The messages whose stretch of the trip its stops list marks, and the words it marks them in. */
export interface TimelineMarks {
  readonly messages: readonly TripMessage[]
  readonly words: Words
}

/**
 * The trip's stops with the times its state allows: none for an interval trip; the timetable's
 * with the delay unknown for No signal; the timetable's alone for Timetable only; else the
 * timetable's with the expected time and the delay where the answer gives one. Each call's time
 * is its departure, the last's its arrival. The first and last stop of each message in `marks`
 * say so after their names.
 */
export function timelineStops(
  detail: TripDetail,
  state: DataState,
  timezone: string,
  marks?: TimelineMarks,
): TimelineStop[] {
  const interval = runsToInterval(detail)
  const last = detail.calls.length - 1
  return detail.calls.map((call, i) => {
    const cancelled = detail.cancelled === true || call.cancelled === true
    const name = marks ? notedName(call, marks.messages, marks.words) : call.name
    const base = { name, ...(cancelled ? { cancelled } : {}) }
    if (interval) return base
    const scheduled = i === last ? call.arrival : call.departure
    const expected = i === last ? call.expectedArrival : call.expectedDeparture
    const time = clockTime(scheduled, timezone)
    if (state === 'no-signal') return { ...base, time, delay: null }
    if (state === 'timetable-only' || expected === undefined) return { ...base, time }
    return {
      ...base,
      time,
      ...(Math.abs(expected - scheduled) >= EXPECTED_FROM
        ? { expected: clockTime(expected, timezone) }
        : {}),
      delay: Math.round((expected - scheduled) / 60_000),
    }
  })
}
