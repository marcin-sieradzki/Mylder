// What one departure row says (docs/screens.md, "Stop departures"; docs/data-states.md, "The
// states"): the countdown, the time beside it and the delay, each following the trip's data
// state. Live and Ageing show the expected time, Estimated the expected time marked "~",
// Timetable only and No signal the timetabled time and an unknown delay; the timetabled time is
// struck beside an expected one a minute or more away from it. Perron's DepartureRow draws them. The delay is
// Rejseplanen's own, expected minus timetabled, where the state shows the expected time. A row's
// state is its trip's on the map, aged by the clock, and Estimated where the board's own realtime
// for it is newer than anything the map has.
import type { DataState } from '../domain/data-state.ts'
import { followsExpected, shownAt, updatedState } from '../domain/departure.ts'
import type { LineBadgeProps } from '@mylder/perron'
import type { Mode } from '../timetable/format.ts'
import { clockTime } from '../timetable/time.ts'
import type { AnswerSource, StopDeparture } from '../tracker/index.ts'

/** The struck timetabled time shows from a minute's difference. */
const STRIKE_FROM = 60_000

/** A departure's times as DepartureRow takes them. */
export interface DepartureTimes {
  /** Seconds until it leaves, from the time the state shows; negative once that has passed. */
  readonly countdown: number
  /**
   * The row's timetabled time, `HH:MM`: the timetable's where an expected time a minute or more
   * from it strikes it, else the time the state shows, so a smaller difference strikes nothing.
   */
  readonly time: string
  /**
   * The expected time, `HH:MM`, where the state shows one: the row strikes `time` before it when
   * the two differ, and marks it "~" for an estimate.
   */
  readonly expected?: string
  /** Whole minutes late, negative early; none without an expected time the state shows. */
  readonly delay?: number
}

/** A departure's times in `state` at `now`, read on the clock of `timezone`, the timetable's. */
export function departureTimes(
  row: StopDeparture,
  state: DataState,
  now: number,
  timezone: string,
): DepartureTimes {
  const expected = followsExpected(state) ? row.expected : undefined
  const shown = shownAt(row, state)
  const strike = expected !== undefined && Math.abs(expected - row.scheduled) >= STRIKE_FROM
  return {
    countdown: (shown - now) / 1000,
    time: clockTime(strike ? row.scheduled : shown, timezone),
    ...(followsExpected(state) ? { expected: clockTime(shown, timezone) } : {}),
    ...(expected === undefined ? {} : { delay: Math.round((expected - row.scheduled) / 60_000) }),
  }
}

/**
 * A departure's state now: its trip's on the map (`onMap`), aged by the clock, where the page's
 * snapshot carries it, else the answer's; but a row the board gave realtime keeps it, Estimated
 * where the map has no current realtime for the trip.
 */
export function departureState(
  row: StopDeparture,
  source: AnswerSource,
  onMap: DataState | undefined,
): DataState {
  if (onMap === undefined) return row.state
  const boardRealtime = source.kind === 'rejseplanen' && row.expected !== undefined
  return boardRealtime && !row.cancelled ? updatedState(onMap) : onMap
}

/** The Perron S-tog and Metro lines a badge has colours for, by the token's last word. */
const NAMED_LINES = new Set(['m1', 'm2', 'm3', 'm4', 'a', 'b', 'c', 'e', 'f', 'h'])

const LINE_TOKEN = /^perron-color-transit-line-([a-z0-9]+)$/

/**
 * The Perron line a badge takes for a line's colour token: a Metro or S-tog line its own, any bus
 * `bus`, and every other train `regional`.
 */
export function badgeLine(colour: string, mode: Mode): LineBadgeProps['line'] {
  const named = LINE_TOKEN.exec(colour)?.[1]
  if (named && NAMED_LINES.has(named)) return named as LineBadgeProps['line']
  return mode === 'bus' ? 'bus' : 'regional'
}
