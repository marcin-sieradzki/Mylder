// City pulse's figures (docs/screens.md, "City pulse"), from the snapshot and the states by the
// clock alone, so the figures and the dots never disagree. Each figure follows the mode filters;
// a figure the data can't back is none, with the reason it can't be known.
import { AGEING_ENDS, liveLimit, reportInterval, type DataState } from '../domain/data-state'
import { describeSource } from '../domain/source'
import type { DataStates } from '../map/states'
import { onMap } from '../map/vehicles'
import { MODES, type Mode } from '../timetable/format'
import type { Snapshot, SnapshotTrip } from '../tracker/index'
import { carriesDelays, DELAY_KNOWN } from './delays'

/**
 * Why a figure is "—": on the timetable source no live position is connected yet, so none can
 * report.
 */
export type Unknown = 'computed-only' | 'paused' | 'none-underway' | 'timetable'

/** Why the average delay is "—": too few trips carry one for a mean, or positions are paused. */
export type DelayUnknown = Extract<Unknown, 'paused'> | 'too-few'

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

/** How many vehicles of a mode are on the move, as On the move counts them. */
export interface ModeCount {
  readonly mode: Mode
  readonly count: number
}

/** How many trips are in each state, as Perron's ReportStrip and DataStateKey count them. */
export interface StateCounts {
  readonly live: number
  readonly ageing: number
  readonly estimated: number
  readonly timetableOnly: number
  readonly noSignal: number
}

export interface Pulse {
  /** Underway, not Waiting and not No signal, in the modes the filters show. */
  readonly moving: number
  /** Every trip on the map, whatever the filters: the whole kept in view. */
  readonly inService: number
  readonly reported: number | Unknown
  /**
   * The mean delay in seconds, when at least `MIN_DELAYS` trips carry one, or why it can't be
   * known; none when the snapshot carries no delays at all, or on the timetable source, which
   * can't know one, and Reporting live takes its slot.
   */
  readonly delay?: { readonly mean: number; readonly count: number } | DelayUnknown
  /** Live and Ageing over underway, the Metro left out: the sum of the meters. */
  readonly live: Share | Unknown
  readonly modes: readonly ModeShare[]
  /**
   * The vehicles on the move in each mode the filters show, in the modes' order: together the
   * On the move figure, each the count its mode's chip gives while none is No signal.
   */
  readonly movingByMode: readonly ModeCount[]
  /** The trips on the map in each state, after the filters, in the keys Perron's parts take. */
  readonly states: StateCounts
  /** The Live limit and the end of Ageing, in ms, for the key's sentences. */
  readonly thresholds: { readonly live: number; readonly ageing: number }
}

/** An average delay needs this many trips with one, or it would be a few trips' word. */
export const MIN_DELAYS = 20

/** States a vehicle's own report gives. */
const REPORTING: ReadonlySet<DataState> = new Set(['live', 'ageing'])

const NO_FILTER: ReadonlySet<Mode> = new Set()

/**
 * When positions are paused (docs/data-states.md, "Paused"): never on a source that asks
 * Rejseplanen nothing, such as the timetable; at once when the month's calls are spent or no
 * position is asked for, else the moment the latest good answer is older than the Live limit; none
 * while the API answers well.
 */
export function pausedFrom(snapshot: Snapshot): number | undefined {
  if (!describeSource(snapshot.source.kind).callsRejseplanen) return undefined
  if (snapshot.budget.level === 'spent' || snapshot.positionMode === 'none') return -Infinity
  if (snapshot.api.status === 'ok') return undefined
  const answered = Math.min(snapshot.api.since, snapshot.fetched)
  return answered + liveLimit(snapshot.pollInterval, snapshot.positionMode)
}

/** The figures, with `states` the trips' states by the clock and `paused` whether positions are. */
export function pulseOf(
  snapshot: Snapshot,
  states: DataStates,
  hidden: ReadonlySet<Mode>,
  paused: boolean,
): Pulse {
  const stateOf = (trip: SnapshotTrip) => states.get(trip.key) ?? trip.state
  const all = snapshot.trips.filter((trip) => onMap(trip, NO_FILTER))
  const shown = all.filter((trip) => onMap(trip, hidden))
  const underway = shown.filter((trip) => !trip.waiting)
  const moving = underway.filter((trip) => stateOf(trip) !== 'no-signal')
  const reporting = (trip: SnapshotTrip) => REPORTING.has(stateOf(trip))

  const computedOnly = snapshot.positionMode === 'CALC_REPORT'
  const noPositions = !describeSource(snapshot.source.kind).positions
  const why: Unknown | undefined = noPositions
    ? 'timetable'
    : paused
      ? 'paused'
      : computedOnly
        ? 'computed-only'
        : undefined

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
    .filter((trip) => DELAY_KNOWN.has(stateOf(trip)))
    .map((trip) => trip.delay!)
  // Whether the answers carry delays is the city's, so a filter or a quiet hour never swaps the
  // figure for another: under the minimum it says so.
  const delay: Pulse['delay'] =
    noPositions || !carriesDelays(snapshot)
      ? undefined
      : paused
        ? 'paused'
        : delays.length < MIN_DELAYS
          ? 'too-few'
          : {
              mean: delays.reduce((sum, each) => sum + each, 0) / delays.length,
              count: delays.length,
            }

  const shareOf = (trips: readonly SnapshotTrip[]): Share | Unknown =>
    why ??
    (trips.length === 0
      ? 'none-underway'
      : { count: trips.filter(reporting).length, total: trips.length })
  const shownModes = MODES.filter(
    (mode) => !hidden.has(mode) && all.some((trip) => trip.mode === mode),
  )
  const modes = shownModes.map((mode): ModeShare => {
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
  const byState: StateCounts = {
    live: counts.live,
    ageing: counts.ageing,
    estimated: counts.estimated,
    timetableOnly: counts['timetable-only'],
    noSignal: counts['no-signal'],
  }

  return {
    moving: moving.length,
    inService: all.length,
    reported,
    ...(delay === undefined ? {} : { delay }),
    live: shareOf(underway.filter((trip) => trip.mode !== 'metro')),
    modes,
    movingByMode: shownModes.map((mode) => ({
      mode,
      count: moving.filter((trip) => trip.mode === mode).length,
    })),
    states: byState,
    thresholds: {
      live: liveLimit(snapshot.pollInterval, snapshot.positionMode),
      ageing: AGEING_ENDS,
    },
  }
}
