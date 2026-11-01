// The trips standing at a stop's platforms now (docs/screens.md, "Stop panel"; GLOSSARY.md,
// "Standing"): worked out without a call, from the stop's calls in the timetable and the snapshot.
// A trip stands at a call between its shown arrival and its shown departure there, the times its
// data state shows (docs/data-states.md); at its first stop from 5 minutes before it leaves, as a
// Waiting trip; and at its last for 2 minutes after its shown arrival, since no source says when it
// leaves the platform. Where the stop's departure board is in hand, its expected times and tracks
// win over the snapshot's. The Metro is left out, so 20-second stops don't flicker in and out, and
// so is a cancelled trip or call. Soonest shown departure first.
import 'server-only'
import type { DataState } from '../domain/data-state.ts'
import { followsExpected, shownAt } from '../domain/departure.ts'
import {
  ENDED_STANDS_FOR,
  expectedTimes,
  WAITING_FROM,
  type TimedCall,
} from '../domain/trip-motion.ts'
import type { Mode } from '../timetable/format.ts'
import type { PlannedTrip } from '../timetable/trips.ts'
import type { SnapshotDelays } from './answers.ts'
import type { History } from './build.ts'
import type { Timetable } from './timetable.ts'

/** One trip standing at one of a stop's platforms now. */
export interface StandingTrip {
  readonly trip: string
  readonly line: string
  readonly mode: Mode
  /** The line's Perron colour token, such as `perron-color-transit-line-a`. */
  readonly colour: string
  readonly headsign: string
  readonly platform: string
  /** The platform's track or stand, when the stop's board gives one. */
  readonly track?: string
  /**
   * Its departure here, timetabled, and expected where the board or the snapshot's delay gives
   * one, as a departure row takes them; none for a trip that ends here.
   */
  readonly scheduled?: number
  readonly expected?: number
  /** When it leaves, as its data state shows it; none for a trip that ends here. */
  readonly departs?: number
  /** It ends here, and stands until 2 minutes after its shown arrival. */
  readonly ends?: true
  readonly state: DataState
}

/** What a stop's departure board says of one of its departures, joined to its trip's call. */
export interface BoardCall {
  readonly expected?: number
  readonly track?: string
  readonly cancelled?: true
  /** The trip's state once the board's realtime is counted. */
  readonly state: DataState
}

/** A call's key among a stop's calls: its trip's key and the call's index. */
export const callKey = (trip: PlannedTrip, index: number) => `${trip.key} ${index}`

/** The trip's times at one call, expected and timetabled, from the board or the snapshot. */
interface CallTimes {
  readonly arrival: number
  readonly departure: number
  readonly expectedArrival?: number
  readonly expectedDeparture?: number
}

/**
 * A call's times as the board gives them: its expected departure, and the arrival late by as
 * much, never after it.
 */
function fromBoard(trip: PlannedTrip, index: number, board: BoardCall): CallTimes {
  const { arrival, departure } = trip.calls[index]
  const { expected } = board
  if (expected === undefined) return { arrival, departure }
  const expectedArrival = Math.min(arrival + (expected - departure), expected)
  return { arrival, departure, expectedArrival, expectedDeparture: expected }
}

/** A call's times as the snapshot expects them for its trip, when it has a delay. */
function fromSnapshot(
  trip: PlannedTrip,
  index: number,
  shifted: readonly TimedCall[] | undefined,
): CallTimes {
  const { arrival, departure } = trip.calls[index]
  if (!shifted) return { arrival, departure }
  const expected = shifted[index]
  return {
    arrival,
    departure,
    expectedArrival: expected.arrival,
    expectedDeparture: expected.departure,
  }
}

/** What the standing trips are worked out from, beside the timetable and the snapshot. */
export interface StandingInput {
  /** The moment they stand at: the clock's, which may run past the snapshot's. */
  readonly now: number
  /** The stop's departure board's word on its calls, by `callKey`, when the board is in hand. */
  readonly board?: ReadonlyMap<string, BoardCall>
  /**
   * What the tracker remembers of each trip, which keeps the delay of one that has arrived at its
   * last stop and left the map while it stands there.
   */
  readonly history?: History
}

/**
 * The trips standing at a stop's platforms at `now`, the Metro aside, soonest shown departure
 * first, a trip that ends here by when it stops counting. A trip that has left the map at its
 * last stop with a delay the history keeps stands Estimated, as a departure with realtime off the
 * map does.
 */
export function standingAt(
  timetable: Timetable,
  snapshot: SnapshotDelays,
  stopIndex: number,
  { now, board, history }: StandingInput,
): StandingTrip[] {
  const { platforms } = timetable.stops
  const onMap = new Map(snapshot.trips.map((trip) => [trip.key, trip]))
  // The days running now, and the next one when a trip of it may be waiting to leave.
  const days = new Set([
    ...timetable.serviceDaysAt(now),
    ...timetable.serviceDaysAt(now + WAITING_FROM),
  ])
  const standing: { trip: StandingTrip; until: number }[] = []
  for (const day of days) {
    for (const trip of timetable.tripsOn(day)) {
      if (trip.line.mode === 'metro') continue
      const last = trip.calls.length - 1
      let shifted: readonly TimedCall[] | undefined
      const live = onMap.get(trip.key)
      // Off the map, a trip's delay is the history's: one remembered before it is drawn, or one
      // that has arrived at its last stop and stands there.
      const delay = live ? live.delay : history?.[trip.key]?.delay
      trip.calls.forEach((call, index) => {
        if (platforms[call.platform].stop !== stopIndex) return
        if (live?.cancelled || live?.cancelledCalls?.includes(index)) return
        const word = index < last ? board?.get(callKey(trip, index)) : undefined
        if (word?.cancelled) return
        // On the map, by SIRI-ET's steps where it has them, as the map moves it.
        if (!word && delay !== undefined) shifted ??= expectedTimes(trip.calls, live ?? { delay })
        const times = word ? fromBoard(trip, index, word) : fromSnapshot(trip, index, shifted)
        const off = delay === undefined ? 'timetable-only' : 'estimated'
        const state = word?.state ?? live?.state ?? off
        const arrives = followsExpected(state)
          ? (times.expectedArrival ?? times.arrival)
          : times.arrival
        const departs = shownAt(
          { scheduled: times.departure, expected: times.expectedDeparture },
          state,
        )
        const from = index === 0 ? departs - WAITING_FROM : arrives
        const until = index === last ? arrives + ENDED_STANDS_FOR : departs
        if (now < from || now >= until) return
        const { name, mode, colour } = trip.line
        standing.push({
          until,
          trip: {
            trip: trip.key,
            line: name,
            mode,
            colour,
            headsign: trip.headsign,
            platform: platforms[call.platform].id,
            ...(word?.track === undefined ? {} : { track: word.track }),
            ...(index === last
              ? { ends: true as const }
              : {
                  scheduled: times.departure,
                  ...(times.expectedDeparture === undefined
                    ? {}
                    : { expected: times.expectedDeparture }),
                  departs,
                }),
            state,
          },
        })
      })
    }
  }
  return standing.sort((a, b) => a.until - b.until).map(({ trip }) => trip)
}
