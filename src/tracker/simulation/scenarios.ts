// The simulated Rejseplanen's scenarios: data, not code. Every figure here is made up to show
// the rules working, and none is evidence for a threshold; the morning-rush recording (#12)
// and the first day with the key measure the real ones.
import 'server-only'
import type { Mode } from '../../timetable/format.ts'

/** A spread of delays in seconds, from early (negative) to late, most of them near `from`. */
export interface DelaySpread {
  readonly from: number
  readonly to: number
}

export interface Scenario {
  readonly name: string
  /** The share of each mode's trips that report their position, for `REPORT_ONLY`. */
  readonly reporting: Readonly<Record<Mode, number>>
  /**
   * The share of each mode's trips that `CALC_REPORT` carries, reported or computed. The Metro
   * is in no answer (ADR 0006).
   */
  readonly computed: Readonly<Record<Mode, number>>
  /** Where each mode's trips start their day's delay. */
  readonly delay: Readonly<Record<Mode, DelaySpread>>
  /** The most a trip's delay moves in one minute, in seconds, either way. */
  readonly drift: number
  /** Whether a `journeyPos` journey carries its calls with expected times. */
  readonly journeyStops: boolean
}

/** An ordinary weekday: trains and S-tog mostly reporting, buses about half, the Metro never. */
export const WEEKDAY: Scenario = {
  name: 'weekday',
  reporting: { train: 0.85, 's-tog': 0.9, bus: 0.5, 'light-rail': 0.7, metro: 0 },
  computed: { train: 1, 's-tog': 1, bus: 1, 'light-rail': 1, metro: 0 },
  delay: {
    train: { from: 0, to: 300 },
    's-tog': { from: 0, to: 180 },
    bus: { from: -30, to: 240 },
    'light-rail': { from: 0, to: 120 },
    metro: { from: 0, to: 0 },
  },
  drift: 20,
  journeyStops: true,
}

export const SCENARIOS: Readonly<Record<string, Scenario>> = { weekday: WEEKDAY }

/** The scenario `simulated` runs when none is named. */
export const DEFAULT_SCENARIO = 'weekday'
