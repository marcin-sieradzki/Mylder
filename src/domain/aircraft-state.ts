// The aircraft's data-state rule, as docs/data-states.md ("Aircraft") gives it: the sibling of
// the trips' rule in data-state.ts, with the same words but never Timetable only. Each aircraft
// carries its own position's age and how the position was found, so the rule needs no history.
// The server runs it at fetch time to set each aircraft's state, and the browser runs it again
// from the same fields and the clock. Times are milliseconds since the epoch; ages and the poll
// interval are seconds, as the aircraft snapshot carries them. Every threshold is provisional
// until the real recording (#135) measures the feed.
import type { DataState } from './data-state.ts'

/** An aircraft's data state: the trips' states but Timetable only, which never applies to it. */
export type AircraftState = Exclude<DataState, 'timetable-only'>

/**
 * How the position was found: broadcast by the aircraft itself (ADS-B, ADS-R or ADS-C), worked
 * out by multilateration on the ground, relayed as TIS-B, or any other way.
 */
export type PositionSource = 'broadcast' | 'multilateration' | 'tisb' | 'other'

/** What the aircraft snapshot carries of an aircraft's position for the rule. */
export interface AircraftPosition {
  /** How old the position was at the snapshot's fetch, in seconds. */
  readonly age: number
  readonly source: PositionSource
}

/** The aircraft snapshot's side of the rule: its clock, its poll and how the feed answered. */
export interface AircraftStateContext {
  /** The moment to decide at. */
  readonly now: number
  /** When the snapshot was built: the time of its answer, when the health is ok. */
  readonly fetched: number
  /** The snapshot's poll interval, in seconds. */
  readonly pollInterval: number
  /** How the feed last answered, and since when it has answered that way. */
  readonly health: { readonly status: 'ok' | 'error'; readonly since: number }
}

/** A broadcast position keeps an aircraft Live for this many polls: one missed poll ends nothing. */
export const LIVE_LIMIT_POLLS = 2

/** A broadcast position this old is no longer Ageing, nor a worked-out one Estimated. */
export const POSITION_FRESH_FOR = 60_000

/** A feed failing for longer than this leaves every aircraft No signal. */
export const FEED_FAILED_AFTER = 60_000

/** A position this old is dropped: the aircraft leaves the map. */
export const DROPPED_AFTER = 5 * 60_000

/**
 * An aircraft's data state at a moment, or none once its position is old enough to drop. A
 * position the ground network worked out is never Live (ADR 0005's rule carried over).
 */
export function aircraftState(
  position: AircraftPosition,
  { now, fetched, pollInterval, health }: AircraftStateContext,
): AircraftState | undefined {
  const age = position.age * 1000 + (now - fetched)
  if (age >= DROPPED_AFTER) return undefined
  if (health.status === 'error' && now - health.since > FEED_FAILED_AFTER) return 'no-signal'
  if (age >= POSITION_FRESH_FOR) return 'no-signal'
  if (position.source !== 'broadcast') return 'estimated'
  return age < LIVE_LIMIT_POLLS * pollInterval * 1000 ? 'live' : 'ageing'
}
