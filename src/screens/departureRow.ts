// What one departure row says (docs/screens.md, "Stop departures"; docs/data-states.md, "The
// states"): the countdown, the time beside it and the delay, each following the trip's data
// state. Live and Ageing show the expected time, Estimated the expected time marked "~",
// Timetable only the timetabled time, and No signal "Unknown" beside the timetabled time; the
// timetabled time is struck beside an expected one a minute or more away from it. The delay is
// Rejseplanen's own, expected minus timetabled.
import type { DataState } from '../domain/data-state.ts'
import type { LineBadgeProps } from '@mylder/perron'
import type { Mode } from '../timetable/format.ts'
import { clockTime } from '../timetable/time.ts'
import type { StopDeparture } from '../tracker/index.ts'

/** The struck timetabled time shows from a minute's difference. */
const STRIKE_FROM = 60_000

export interface DepartureTimes {
  /** Seconds until it leaves, from the time the state shows; negative once that has passed. */
  readonly countdown: number
  /** The time the state shows, `HH:MM`, and "~" before it for an estimate. */
  readonly time: string
  readonly estimate: boolean
  /** The timetabled time, struck beside `time`, when the two differ by a minute or more. */
  readonly struck?: string
  /** "Unknown" stands beside the time: No signal's. */
  readonly unknown: boolean
  /** Whole minutes late, negative early; none without an expected time. */
  readonly delay?: number
}

/** A departure's times in `state` at `now`, read on the clock of `timezone`, the timetable's. */
export function departureTimes(
  row: StopDeparture,
  state: DataState,
  now: number,
  timezone: string,
): DepartureTimes {
  const followsExpected = state === 'live' || state === 'ageing' || state === 'estimated'
  const shown = followsExpected ? (row.expected ?? row.scheduled) : row.scheduled
  const strike =
    followsExpected &&
    row.expected !== undefined &&
    Math.abs(row.expected - row.scheduled) >= STRIKE_FROM
  return {
    countdown: (shown - now) / 1000,
    time: clockTime(shown, timezone),
    estimate: state === 'estimated',
    ...(strike ? { struck: clockTime(row.scheduled, timezone) } : {}),
    unknown: state === 'no-signal',
    ...(row.expected === undefined
      ? {}
      : { delay: Math.round((row.expected - row.scheduled) / 60_000) }),
  }
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
