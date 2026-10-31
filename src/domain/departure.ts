// What a departure's time and state follow (docs/data-states.md, "The states"; docs/screens.md,
// "Stop panel"), one rule for the server that lists and sorts a stop's departures and the
// browser that shows them as their trips age. Times are milliseconds since the epoch.
import type { DataState } from './data-state.ts'

/**
 * Whether a departure in this state shows its expected time: Live, Ageing and Estimated do;
 * Timetable only and No signal show the timetabled time, and no delay.
 */
export const followsExpected = (state: DataState): boolean =>
  state === 'live' || state === 'ageing' || state === 'estimated'

/** The moment a departure shows in its state, which its countdown, order and window follow. */
export const shownAt = (
  departure: { readonly scheduled: number; readonly expected?: number },
  state: DataState,
): number =>
  followsExpected(state) ? (departure.expected ?? departure.scheduled) : departure.scheduled

/**
 * A trip's state once a fresh update, such as a stop's board, gave it an expected time: an update
 * newer than any position keeps a trip with no current realtime Estimated (`dataState`'s rule),
 * so Timetable only and No signal turn Estimated and the rest keep their own.
 */
export const updatedState = (state: DataState): DataState =>
  state === 'timetable-only' || state === 'no-signal' ? 'estimated' : state
