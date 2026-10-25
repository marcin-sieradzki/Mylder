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

/** How a scheduled failure answers. */
export type FailureKind = 'unavailable' | 'timeout' | 'empty' | 'refused-key' | 'quota'

/** A failure every hour, from minute `from` up to minute `to` of the hour. */
export interface Failure {
  readonly from: number
  readonly to: number
  readonly kind: FailureKind
}

/** A moment relative to the service day: days after it, and the time on the clock that day. */
export interface DayTime {
  readonly day: number
  readonly time: `${number}:${number}`
}

/** A disruption message, in Danish as Rejseplanen writes them, valid between two moments. */
export interface ScenarioMessage {
  readonly id: string
  readonly head: string
  readonly lead: string
  readonly text: string
  readonly company: string
  readonly category: string
  readonly priority: number
  /** The product classes it concerns, as a bitmask. */
  readonly products: number
  /** The stops it names, by their GTFS ids without leading zeros. Ids not in the timetable drop. */
  readonly stops: readonly string[]
  readonly from: DayTime
  readonly to: DayTime
}

export interface Scenario {
  readonly name: string
  /** The share of each mode's trips that report their position, for `REPORT_ONLY`. */
  readonly reporting: Readonly<Record<Mode, number>>
  /**
   * The share of each mode's trips that `CALC_REPORT` carries, reported or computed. The Metro
   * is in no answer whatever this says (ADR 0006).
   */
  readonly computed: Readonly<Record<Mode, number>>
  /** Where each mode's trips start their day's delay. */
  readonly delay: Readonly<Record<Mode, DelaySpread>>
  /** The most a trip's delay moves in one minute, in seconds, either way. */
  readonly drift: number
  /** Whether a `journeyPos` journey carries its calls with expected times. */
  readonly journeyStops: boolean
  readonly silence: {
    /** The share of trips that go quiet once, for between `minutes.from` and `minutes.to`. */
    readonly share: number
    readonly minutes: { readonly from: number; readonly to: number }
    /** The share of trips that go quiet partway and stay quiet. */
    readonly forGood: number
  }
  /** The share of trips cancelled outright. */
  readonly cancelled: number
  /** The share of trips with one call cancelled, a stop they pass without calling. */
  readonly cancelledCall: number
  /** Extra trips per planned trip, each a copy running a few minutes behind it. */
  readonly extra: number
  readonly failures: readonly Failure[]
  readonly messages: readonly ScenarioMessage[]
}

const WEEKDAY_MESSAGES: readonly ScenarioMessage[] = [
  {
    id: 'simulated-1',
    head: 'Linje 5C kører en anden rute ved Langebro',
    lead: 'På grund af vejarbejde kører linje 5C via Knippelsbro.',
    text: 'På grund af vejarbejde på Langebro kører linje 5C via Knippelsbro. Stoppestedet Klaksvigsgade (Langebro) betjenes ikke.',
    company: 'Movia',
    category: '2',
    priority: 60,
    products: 32,
    stops: ['807'],
    from: { day: 0, time: '04:00' },
    to: { day: 3, time: '23:59' },
  },
  {
    id: 'simulated-2',
    head: 'Færre S-tog mellem København H og Hellerup',
    lead: 'Signalfejl ved Østerport. Forvent ventetid og ændrede spor.',
    text: 'På grund af en signalfejl ved Østerport kører der færre S-tog mellem København H og Hellerup. Forvent ventetid og ændrede spor.',
    company: 'DSB S-tog',
    category: '1',
    priority: 80,
    products: 16,
    stops: ['8600626', '8600655'],
    from: { day: 0, time: '05:00' },
    to: { day: 0, time: '23:30' },
  },
  {
    id: 'simulated-3',
    head: 'Ingen S-tog mellem Hellerup og Holte i weekenden',
    lead: 'Sporarbejde. Togbusser kører i stedet.',
    text: 'På grund af sporarbejde kører der ingen S-tog mellem Hellerup og Holte. Togbusser kører i stedet.',
    company: 'DSB S-tog',
    category: '1',
    priority: 40,
    products: 16,
    stops: ['8600655', '8600677'],
    from: { day: 1, time: '01:00' },
    to: { day: 2, time: '23:00' },
  },
]

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
  silence: { share: 0.05, minutes: { from: 2, to: 4 }, forGood: 0.01 },
  cancelled: 0.01,
  cancelledCall: 0.02,
  extra: 0.005,
  failures: [],
  messages: WEEKDAY_MESSAGES,
}

/** Few reports, frequent silences, no stops in positions and a 7-minute outage every hour. */
export const PATCHY: Scenario = {
  ...WEEKDAY,
  name: 'patchy',
  reporting: { train: 0.3, 's-tog': 0.35, bus: 0.15, 'light-rail': 0.2, metro: 0 },
  journeyStops: false,
  silence: { share: 0.4, minutes: { from: 2, to: 8 }, forGood: 0.08 },
  failures: [{ from: 20, to: 27, kind: 'unavailable' }],
}

/** No vehicle reports: `REPORT_ONLY` answers are empty and every position is computed. */
export const COMPUTED_ONLY: Scenario = {
  ...WEEKDAY,
  name: 'computed-only',
  reporting: { train: 0, 's-tog': 0, bus: 0, 'light-rail': 0, metro: 0 },
}

/** The month's calls are used up: every call gets the quota error, from the first. */
export const SPENT: Scenario = {
  ...WEEKDAY,
  name: 'spent',
  failures: [{ from: 0, to: 60, kind: 'quota' }],
}

/** A full box: two extra trips behind each planned one, so an answer at a busy hour hits `maxJny`. */
export const CAP: Scenario = { ...WEEKDAY, name: 'cap', extra: 2 }

export const SCENARIOS: Readonly<Record<string, Scenario>> = Object.fromEntries(
  [WEEKDAY, PATCHY, COMPUTED_ONLY, SPENT, CAP].map((scenario) => [scenario.name, scenario]),
)

/** The scenario `simulated` runs when none is named. */
export const DEFAULT_SCENARIO = 'weekday'

/** The scenario of a name, `weekday` when none is named, or an error naming the ones there are. */
export function scenarioNamed(name: string = DEFAULT_SCENARIO): Scenario {
  const scenario = SCENARIOS[name]
  if (!scenario) {
    throw new Error(
      `No simulated scenario "${name}"; there are ${Object.keys(SCENARIOS).join(', ')}`,
    )
  }
  return scenario
}
