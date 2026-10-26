// The recordings in `recordings/`, as the plans `npm run recordings` freezes them from: each a
// scenario of the simulated Rejseplanen over the fixture timetable, from a moment, for a number
// of minutes. The hand-made cases docs/testing-seams.md lists are frozen the same way.
import 'server-only'
import { MAX_JOURNEYS } from '../tracker.ts'
import { CAP, SPENT, WEEKDAY, type FailureKind, type Scenario } from '../simulation/scenarios.ts'

export interface RecordingPlan {
  /** The recording's folder in `recordings/`, and its name in `MYLDER_SOURCE=recording:<name>`. */
  readonly name: string
  readonly scenario: Scenario
  /** The moment the recording starts, its `clock.json`. */
  readonly start: number
  /** How many minutes it runs: one tracker run, and so one `journeyPos` call, a minute. */
  readonly minutes: number
  /** Fill every `journeyPos` answer to this many journeys, as a full box at a peak would be. */
  readonly fill?: number
  /**
   * Route answers saved beside the snapshots, for screen tests: these stops' departures and these
   * trips' details as the stop and trip routes answer them from the timetable and the snapshot of
   * the plan's `minute`, counted from 0.
   */
  readonly answers?: {
    readonly minute: number
    readonly stops: readonly string[]
    readonly trips?: readonly string[]
  }
}

/** 07:20 in Copenhagen on Tuesday 2026-06-16, when the fixture has trips underway. */
export const RECORDING_START = Date.UTC(2026, 5, 16, 5, 20)

/** A weekday where every call of the hour fails as one kind. */
const failingAll = (kind: FailureKind): Scenario => ({
  ...WEEKDAY,
  name: kind,
  failures: [{ from: 0, to: 60, kind }],
})

export const RECORDINGS: readonly RecordingPlan[] = [
  {
    name: 'weekday',
    scenario: WEEKDAY,
    start: RECORDING_START,
    minutes: 10,
    // Nørreport, with Live and Estimated departures by bus and S-tog; Orientkaj St., Timetable only;
    // Hillerød St., with none in the next 30 minutes. A Live S-tog, an Estimated bus, a Metro
    // trip, and a bus that stands Waiting at Orientkaj St. from 07:25.
    answers: {
      minute: 1,
      stops: ['27532', '54307', '8600683'],
      trips: [
        's-tog.A.0bc307e3eb.20260616.0707',
        'bus.5C.32331e0e20.20260616.0707',
        'metro.M1.7f21f99145.20260616.0707',
        'bus.991.7ce514fd98.20260616.0730',
      ],
    },
  },
  { name: 'empty', scenario: failingAll('empty'), start: RECORDING_START, minutes: 3 },
  { name: 'refused-key', scenario: failingAll('refused-key'), start: RECORDING_START, minutes: 3 },
  { name: 'spent', scenario: SPENT, start: RECORDING_START, minutes: 3 },
  {
    name: 'cap',
    // One minute, without each journey's stops, so 1,000 journeys stay under a megabyte.
    scenario: { ...CAP, journeyStops: false },
    start: RECORDING_START,
    minutes: 1,
    fill: MAX_JOURNEYS,
  },
]
