// City pulse's figures (docs/screens.md, "City pulse"), from the snapshot and the states by the
// clock alone, so the figures and the dots never disagree. Each figure follows the mode filters;
// a figure the data can't back is none, with the reason it can't be known.
import { AGEING_ENDS, liveLimit, reportInterval, type DataState } from '../domain/data-state'
import type { DataStates } from '../map/states'
import { onMap } from '../map/vehicles'
import { MODES, type Mode } from '../timetable/format'
import type { Snapshot, SnapshotTrip } from '../tracker/index'

/** Why a figure is "—". */
export type Unknown = 'computed-only' | 'paused' | 'none-underway'

/** A share of the trips that could report: how many did, of how many. */
export interface Share {
  readonly count: number
  readonly total: number
}

export interface ModeShare {
  readonly mode: Mode
  /** None for the Metro, an interval line with no realtime (ADR 0006), or when it can't be known. */
  readonly share?: Share
  readonly unknown?: Unknown | 'metro'
}

export interface Pulse {
  /** Underway, not Waiting and not No signal, in the modes the filters show. */
  readonly moving: number
  /** Every trip on the map, whatever the filters: the whole kept in view. */
  readonly inService: number
  readonly reported: number | Unknown
  /** The mean delay in seconds, when at least `MIN_DELAYS` trips carry one; none otherwise. */
  readonly delay?: { readonly mean: number; readonly count: number }
  /** Live and Ageing over underway, the Metro left out: the sum of the meters. */
  readonly live: Share | Unknown
  readonly modes: readonly ModeShare[]
  /** The trips on the map in each state, after the filters. */
  readonly states: Readonly<Record<DataState, number>>
  /** The poll's interval in seconds, when the budget has stretched it. */
  readonly stretched?: number
  /** The Live limit and the end of Ageing, in ms, for the key's sentences. */
  readonly thresholds: { readonly live: number; readonly ageing: number }
}

/** An average delay needs this many trips with one, or it would be a few trips' word. */
export const MIN_DELAYS = 20

/** States whose position is realtime, so whose delay is the city's now. */
const DELAY_STATES: ReadonlySet<DataState> = new Set(['live', 'ageing', 'estimated'])

/**
 * Whether Mylder's server gets no position answers: the month's calls are spent, or the latest
 * good answer is older than the Live limit (docs/data-states.md, "Paused").
 */
export function isPaused(snapshot: Snapshot, now: number): boolean {
  if (snapshot.budget.level === 'spent' || snapshot.positionMode === 'none') return true
  if (snapshot.api.status === 'ok') return false
  const answered = Math.min(snapshot.api.since, snapshot.fetched)
  return now - answered >= liveLimit(snapshot.pollInterval, snapshot.positionMode)
}

/** The figures at `now`, with `states` the trips' states by the clock. */
export function pulseOf(
  snapshot: Snapshot,
  states: DataStates,
  hidden: ReadonlySet<Mode>,
  now: number,
): Pulse {
  const stateOf = (trip: SnapshotTrip) => states.get(trip.key) ?? trip.state
  const all = snapshot.trips.filter((trip) => onMap(trip, new Set()))
  const shown = all.filter((trip) => onMap(trip, hidden))
  const underway = shown.filter((trip) => !trip.waiting)
  const reporting = (trip: SnapshotTrip) => ['live', 'ageing'].includes(stateOf(trip))

  const paused = isPaused(snapshot, now)
  const computedOnly = snapshot.positionMode === 'CALC_REPORT'
  const why: Unknown | undefined = paused ? 'paused' : computedOnly ? 'computed-only' : undefined

  // A trip reported in the latest report answer, while it is still Live by the clock.
  const interval = reportInterval(snapshot.pollInterval, snapshot.positionMode) * 1000
  const reported =
    why ??
    shown.filter(
      (trip) =>
        trip.reported !== undefined &&
        snapshot.fetched - trip.reported < interval &&
        stateOf(trip) === 'live',
    ).length

  const delays = shown
    .filter((trip) => trip.mode !== 'metro' && trip.delay !== undefined)
    .filter((trip) => DELAY_STATES.has(stateOf(trip)))
    .map((trip) => trip.delay!)
  const delay =
    !paused && delays.length >= MIN_DELAYS
      ? { mean: delays.reduce((sum, each) => sum + each, 0) / delays.length, count: delays.length }
      : undefined

  const shareOf = (trips: readonly SnapshotTrip[]): Share | Unknown =>
    why ??
    (trips.length === 0
      ? 'none-underway'
      : { count: trips.filter(reporting).length, total: trips.length })
  const modes = MODES.filter(
    (mode) => !hidden.has(mode) && all.some((trip) => trip.mode === mode),
  ).map((mode): ModeShare => {
    if (mode === 'metro') return { mode, unknown: 'metro' }
    const share = shareOf(underway.filter((trip) => trip.mode === mode))
    return typeof share === 'string' ? { mode, unknown: share } : { mode, share }
  })

  const counts: Record<DataState, number> = {
    live: 0,
    ageing: 0,
    estimated: 0,
    'timetable-only': 0,
    'no-signal': 0,
  }
  for (const trip of shown) counts[stateOf(trip)]++

  return {
    moving: underway.filter((trip) => stateOf(trip) !== 'no-signal').length,
    inService: all.length,
    reported,
    ...(delay ? { delay } : {}),
    live: shareOf(underway.filter((trip) => trip.mode !== 'metro')),
    modes,
    states: counts,
    ...(['stretched', 'tight'].includes(snapshot.budget.level)
      ? { stretched: snapshot.pollInterval }
      : {}),
    thresholds: {
      live: liveLimit(snapshot.pollInterval, snapshot.positionMode),
      ageing: AGEING_ENDS,
    },
  }
}
