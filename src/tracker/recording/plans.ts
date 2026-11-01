// The recordings in `recordings/`, as the plans `npm run recordings` freezes them from: each a
// scenario of the simulated Rejseplanen over the fixture timetable, from a moment, for a number
// of minutes. The hand-made cases docs/testing-seams.md lists are frozen the same way, and beside
// them the timetable source's run, which `npm run recordings` saves too.
import 'server-only'
import { MAX_JOURNEYS } from '../tracker.ts'
import { CAP, SPENT, WEEKDAY, type FailureKind, type Scenario } from '../simulation/scenarios.ts'

export interface RecordingPlan {
  /** The recording's folder in `recordings/`, and its name in `MYLDER_SOURCE=recording:<name>`. */
  readonly name: string
  readonly scenario: Scenario
  /**
   * The GTFS fixture its timetable is prepared from, a folder in `scripts/timetable/fixtures`:
   * `gtfs`, the real one, when left out.
   */
  readonly fixture?: string
  /** The moment the recording starts, its `clock.json`. */
  readonly start: number
  /** How many minutes it runs: one tracker run, and so one `journeyPos` call, a minute. */
  readonly minutes: number
  /** Fill every `journeyPos` answer to this many journeys, as a full box at a peak would be. */
  readonly fill?: number
  /**
   * Stops a rider opens at the plan's `minute`, counted from 0, on Departures and then on Arrivals,
   * so the recording keeps each one's departure board and arrival board, which answer that stop
   * whenever it is opened on the recording.
   */
  readonly boards?: {
    readonly minute: number
    readonly stops: readonly string[]
  }
  /**
   * Route answers saved beside the snapshots, for screen tests: these stops' departures, these
   * stops' arrivals and these trips' details as the stop, arrivals and trip routes answer them from
   * the timetable and the snapshot of the plan's `minute`, counted from 0.
   */
  readonly answers?: {
    readonly minute: number
    readonly stops: readonly string[]
    readonly arrivals?: readonly string[]
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

/**
 * A weekday on which every trip runs to its timetable, none is cancelled and no message is out,
 * so the trips standing at a stop are the ones its timetable puts there, and nothing else shows.
 */
const ON_TIME: Scenario = {
  ...WEEKDAY,
  name: 'on-time',
  delay: {
    train: { from: 0, to: 0 },
    's-tog': { from: 0, to: 0 },
    bus: { from: 0, to: 0 },
    'light-rail': { from: 0, to: 0 },
    metro: { from: 0, to: 0 },
  },
  drift: 0,
  silence: { share: 0, minutes: { from: 0, to: 0 }, forGood: 0 },
  cancelled: 0,
  cancelledCall: 0,
  extra: 0,
  messages: [],
}

export const RECORDINGS: readonly RecordingPlan[] = [
  {
    name: 'weekday',
    scenario: WEEKDAY,
    start: RECORDING_START,
    minutes: 10,
    // Nørreport, with Live and Estimated departures by bus and S-tog; Orientkaj St., Timetable only;
    // Hillerød St., with none in the next 30 minutes; Bella Center St., where the Metro runs to an
    // interval; Refshaleøen, where a bus stands at the stop. A Live S-tog, an Estimated bus, a
    // Metro trip, and a bus that stands Waiting at Orientkaj St. from 07:25.
    answers: {
      minute: 1,
      stops: ['27532', '54307', '8600683', '8603313', '48645'],
      // Nørreport's buses and S-tog, from where each comes; Bella Center St.'s Metro as an
      // interval; Hillerød St., where nothing arrives in the next 30 minutes; Refshaleøen's bus,
      // Timetable only, at its arrival before it stands.
      arrivals: ['27532', '8603313', '8600683', '48645'],
      trips: [
        's-tog.A.0bc307e3eb.20260616.0707',
        'bus.5C.32331e0e20.20260616.0707',
        'metro.M1.7f21f99145.20260616.0707',
        'bus.991.7ce514fd98.20260616.0730',
      ],
    },
    // København Syd St. at 07:22, while the RE to Næstved stands at its track until 07:23, and the
    // trains arriving there on its arrival board.
    boards: { minute: 2, stops: ['8600783'] },
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
  {
    // Six trains standing at København H at once, from 07:20 to 07:24, on a timetable made by
    // hand for it (scripts/timetable/fixtures/gtfs-crowded), so its standing list folds past four.
    name: 'crowded',
    scenario: ON_TIME,
    fixture: 'gtfs-crowded',
    start: RECORDING_START,
    minutes: 5,
    answers: { minute: 2, stops: ['8600626'] },
  },
]

/**
 * A run of the tracker on the timetable source over the real fixture, saved beside the recordings
 * for screen tests: its snapshot of each minute, its disruption list and the route answers its
 * plan names, with its timetable and the moment it starts in `clock.json`, which
 * `MYLDER_TIMETABLE_FROM=<name>` runs the timetable source on. The source makes no call, so the
 * folder holds no answers and is no recording for `MYLDER_SOURCE=recording:<name>`.
 */
export type TimetablePlan = Pick<RecordingPlan, 'name' | 'start' | 'minutes' | 'answers'>

export const ON_TIMETABLE: TimetablePlan = {
  name: 'timetable-source',
  start: RECORDING_START,
  // To 07:25, when the 991 stands Waiting at Orientkaj St.
  minutes: 6,
  // Nørreport, with buses and S-tog; Orientkaj St., where the 991 leaves at 07:30; Bella Center
  // St., where the Metro runs to an interval. An S-tog, a bus and a Metro trip underway.
  answers: {
    minute: 1,
    stops: ['27532', '54307', '8603313'],
    arrivals: ['27532', '8603313'],
    trips: [
      's-tog.A.0bc307e3eb.20260616.0707',
      'bus.5C.32331e0e20.20260616.0707',
      'metro.M1.7f21f99145.20260616.0707',
    ],
  },
}

/** 07:20 in Copenhagen on Tuesday 2026-08-25, the day before the fixture's window ends. */
const LAST_WEEK = Date.UTC(2026, 7, 25, 5, 20)

/**
 * The timetable source in its timetable's last week, so the timetable notice shows: one minute,
 * for the verifier to launch on (`launch.sh <run> <port> timetable:timetable-ending`).
 */
export const ENDING_TIMETABLE: TimetablePlan = {
  name: 'timetable-ending',
  start: LAST_WEEK,
  minutes: 1,
}

/** The timetable source's plans, each saved by `npm run recordings`. */
export const TIMETABLE_PLANS: readonly TimetablePlan[] = [ON_TIMETABLE, ENDING_TIMETABLE]

/** 09:21 in Copenhagen on Saturday 2026-10-31, in the SIRI-ET recording's hour. */
const SIRI_ET_MOMENT = Date.UTC(2026, 9, 31, 8, 21)

/**
 * The timetable source with SIRI-ET's updates from `recordings/siri-et` (spec #146,
 * `MYLDER_UPDATES=recording:siri-et`), on that recording's own timetable, at its own clock: its
 * snapshots of 09:21 and 09:22 are saved beside its messages for screen tests, with the route
 * answers of 09:22. Bus 102A of 09:04 has two cancelled calls in the first and is cancelled whole
 * in the second. The folder's messages, timetable and clock are recorded, never frozen, so
 * `npm run recordings` rewrites only its `snapshots/` and `answers/`.
 */
export const ON_SIRI_ET: TimetablePlan = {
  name: 'siri-et',
  start: SIRI_ET_MOMENT,
  minutes: 2,
  // Nørreport St., with updated S-tog, trains and buses, others on their timetable, and the Metro
  // on its interval; Otto Mønsteds Plads, which two of bus 68's trips skip; Fændediget, where bus
  // 102A of 09:22 is cancelled whole. Bus 2A, 6 min late at its next stop; bus 4A, 4 min early;
  // bus 68 to Lyngby St., which skips Otto Mønsteds Plads.
  answers: {
    minute: 1,
    stops: ['6584', '30090', '5344'],
    arrivals: ['6584'],
    trips: [
      'bus.2A.643c65fb6f.20261031.0857',
      'bus.4A.a47257f88b.20261031.0900',
      'bus.68.bb4e5908a5.20261031.0916',
    ],
  },
}

/** The plans run with updates from their own folder's SIRI-ET recording. */
export const UPDATES_PLANS: readonly TimetablePlan[] = [ON_SIRI_ET]
