// Freezing and replaying recordings: the tracker runs over a plan's minutes on the test clock,
// once against the simulated Rejseplanen with every answer kept, and once against the recorded
// layer, and both give the same snapshots and disruption lists (docs/testing-seams.md). The stop
// and trip answers a plan saves for screen tests are worked out from those snapshots. The
// timetable source's plan runs the same way on that source, which needs nothing to replay. A
// recording's `aircraft/` folder is recorded from the feed, never frozen: the aircraft snapshots
// saved beside it are what the aircraft source makes of it, one call every 10 s from its start.
import 'server-only'
import { join } from 'node:path'
import { Effect, References } from 'effect'
import { TestClock } from 'effect/testing'
import {
  stopArrivalsFrom,
  stopDeparturesFrom,
  tripDetailFrom,
  type StopArrivals,
  type StopDepartures,
  type TripDetail,
} from '../answers.ts'
import { Aircraft } from '../aircraft/aircraft.ts'
import { aircraftLayer } from '../aircraft/runtime.ts'
import type { AircraftSnapshot } from '../aircraft/snapshot.ts'
import { RECORDED_AIRCRAFT } from '../aircraft/source.ts'
import type { Disruptions } from '../disruptions.ts'
import * as Http from '../http.ts'
import { RECORDED_REJSEPLANEN } from '../rejseplanen/responses.ts'
import { stoppedCpu } from '../report.ts'
import { trackerLayer } from '../runtime.ts'
import { simulatedClient } from '../simulation/layer.ts'
import type { Snapshot } from '../snapshot.ts'
import type { Source } from '../source.ts'
import { loadTimetable, type Timetable } from '../timetable.ts'
import { Tracker } from '../tracker.ts'
import * as RecordedHttpClient from './layer.ts'
import { callFolder, readCalls, readStart, type Calls, type Recorded } from './layer.ts'
import type { RecordingPlan, TimetablePlan } from './plans.ts'

const MINUTE = 60_000

/** What the tracker's routes served at each of a plan's minutes. */
export interface Served {
  readonly snapshots: readonly Snapshot[]
  /** The disruption list's route answer, after that minute's snapshot. */
  readonly disruptions: readonly Disruptions[]
}

/** A frozen recording: each folder's calls in order, and what the routes served each minute. */
export interface Frozen extends Served {
  readonly calls: Calls
}

/** Where a minute's disruption list is saved in a recording's folder, for screen tests. */
export const disruptionsFile = (file: string) => join('answers', 'disruptions', file)

/** Where the aircraft snapshot of each call is saved in a recording's folder, for the screens. */
export const aircraftFile = (file: string) => join('answers', 'aircraft', file)

/** The folders of a recording that are its own, kept when the rest is frozen again. */
export const UNFROZEN = RECORDED_AIRCRAFT.folders

/**
 * The aircraft source's snapshot of each call in a recording's `aircraft/` folder, asked every
 * 10 s on the test clock from the moment its answers start at; none when it has no such folder.
 */
export const replayAircraft = (dir: string): Effect.Effect<readonly AircraftSnapshot[]> =>
  Effect.gen(function* () {
    const [calls, start] = yield* Effect.promise(() =>
      Promise.all([readCalls(RECORDED_AIRCRAFT, dir), readStart(dir, 'aircraft')]),
    )
    const count = calls.get('aircraft')?.length ?? 0
    const source = { kind: 'recording', folder: 'replayed' } as const
    const http = Http.layer(RecordedHttpClient.recordedClient(RECORDED_AIRCRAFT, calls))
    return yield* Effect.gen(function* () {
      const aircraft = yield* Aircraft
      const snapshots: AircraftSnapshot[] = []
      for (let call = 0; call < count; call++) {
        yield* TestClock.setTime(start + call * 10_000)
        snapshots.push((yield* aircraft.getSnapshot)!)
      }
      return snapshots
    }).pipe(Effect.provide(aircraftLayer({ source, http })))
  }).pipe(Effect.provide(TestClock.layer()))

/**
 * The stop, arrivals and trip answers a plan saves for screen tests, by their files' paths in its
 * folder, such as `answers/stops/27532.json`, `answers/arrivals/27532.json` and
 * `answers/trips/<key>.json`: each as its route answers
 * from the timetable and the snapshot of the plan's minute, at that snapshot's moment, with no
 * call, so saving them spends none and leaves the snapshots as they are.
 */
export function savedAnswers(
  plan: Pick<RecordingPlan, 'answers'>,
  timetable: Timetable,
  snapshots: readonly Snapshot[],
): ReadonlyMap<string, StopDepartures | StopArrivals | TripDetail | undefined> {
  const answers = new Map<string, StopDepartures | StopArrivals | TripDetail | undefined>()
  if (!plan.answers) return answers
  const snapshot = snapshots[plan.answers.minute]
  for (const stop of plan.answers.stops) {
    answers.set(
      join('answers', 'stops', `${stop}.json`),
      stopDeparturesFrom(timetable, snapshot, stop),
    )
  }
  for (const stop of plan.answers.arrivals ?? []) {
    answers.set(
      join('answers', 'arrivals', `${stop}.json`),
      stopArrivalsFrom(timetable, snapshot, stop),
    )
  }
  for (const trip of plan.answers.trips ?? []) {
    answers.set(
      join('answers', 'trips', `${trip}.json`),
      tripDetailFrom(timetable, snapshot, trip, snapshot.fetched),
    )
  }
  return answers
}

const sourceOf = (plan: RecordingPlan): Source => ({ kind: 'recording', folder: plan.name })

/**
 * The tracker's snapshot at the start of each of a plan's minutes, and its disruption list, with
 * the stops whose boards it keeps opened at theirs, on both tabs.
 */
const play = (
  plan: Pick<RecordingPlan, 'start' | 'minutes' | 'boards'>,
): Effect.Effect<Served, never, Tracker> =>
  Effect.gen(function* () {
    const tracker = yield* Tracker
    const snapshots: Snapshot[] = []
    const disruptions: Disruptions[] = []
    for (let minute = 0; minute < plan.minutes; minute++) {
      yield* TestClock.setTime(plan.start + minute * MINUTE)
      snapshots.push(yield* tracker.getSnapshot)
      disruptions.push(yield* tracker.getDisruptions)
      if (plan.boards?.minute !== minute) continue
      for (const stop of plan.boards.stops) {
        yield* tracker.getStopDepartures(stop)
        yield* tracker.getStopArrivals(stop)
      }
    }
    return { snapshots, disruptions }
  }).pipe(
    // Each run's report line is noise here; warnings still show.
    Effect.provideService(References.MinimumLogLevel, 'Warn'),
  )

interface PositionLike {
  readonly JourneyDetailRef: { readonly ref: string }
  readonly lat: number
  readonly lon: number
}

/**
 * A `journeyPos` answer filled to `count` journeys with copies of its own, each under a journey
 * number the simulation never gives (900000 and up), a few metres from the one it copies.
 */
export function fillJourneys(answer: unknown, count: number): unknown {
  const { Journey: journeys } = answer as { Journey?: readonly PositionLike[] }
  if (!journeys || journeys.length === 0 || journeys.length >= count) return answer
  const copies = Array.from({ length: count - journeys.length }, (_, i) => {
    const journey = journeys[i % journeys.length]
    const nudge = ((i % 41) - 20) * 0.0002
    return {
      ...journey,
      JourneyDetailRef: {
        ref: journey.JourneyDetailRef.ref.replace(/#ZI#\d+#/, `#ZI#${900_000 + i}#`),
      },
      lat: Number((journey.lat + nudge).toFixed(6)),
      lon: Number((journey.lon - nudge).toFixed(6)),
    }
  })
  return { ...(answer as object), Journey: [...journeys, ...copies] }
}

/** A response as its recorded call: a 200's body, or a failure's status and whatever came with it. */
const recordedOf = (status: number, text: string): Recorded => {
  if (status === 200) return { answer: JSON.parse(text) }
  if (text === '') return { status }
  try {
    return { status, body: JSON.parse(text) }
  } catch {
    return { status, body: text }
  }
}

/** Runs the tracker over a plan against the simulation, keeping every answer it is given. */
export function freeze(plan: RecordingPlan, timetable: Timetable): Effect.Effect<Frozen> {
  // The clock only jumps from minute to minute here, so a call that hangs would hang for good.
  if (plan.scenario.failures.some((failure) => failure.kind === 'timeout')) {
    throw new Error(
      `${plan.name}: a timeout can't be frozen; write its { "timeout": true } file by hand`,
    )
  }
  const calls = new Map<string, Recorded[]>()
  const simulation = simulatedClient({ timetable, scenario: plan.scenario })
  const taped = Http.client((request, url) =>
    Effect.gen(function* () {
      const response = yield* simulation.execute(request)
      const text = yield* Effect.orDie(response.text)
      let recorded = recordedOf(response.status, text)
      // Filed by the same rule the recorded layer replays them by.
      const folder = callFolder(RECORDED_REJSEPLANEN, url)
      if (folder === 'journeyPos' && plan.fill && 'answer' in recorded) {
        recorded = { answer: fillJourneys(recorded.answer, plan.fill) }
      }
      if (folder) calls.set(folder, [...(calls.get(folder) ?? []), recorded])
      return yield* RecordedHttpClient.answer(request, recorded)
    }),
  )
  return play(plan).pipe(
    Effect.provide(
      trackerLayer({ timetable, source: sourceOf(plan), http: Http.layer(taped), cpu: stoppedCpu }),
    ),
    Effect.provide(TestClock.layer()),
    Effect.map((served) => ({ calls, ...served })),
  )
}

/** Runs the tracker over a plan against its recording folder, as it ran when it was frozen. */
export const replay = (plan: RecordingPlan, dir: string): Effect.Effect<Served> =>
  Effect.gen(function* () {
    const timetable = yield* Effect.promise(() => loadTimetable(join(dir, 'timetable')))
    return yield* play(plan).pipe(
      Effect.provide(
        trackerLayer({
          timetable,
          source: sourceOf(plan),
          http: RecordedHttpClient.layer(RECORDED_REJSEPLANEN, dir),
          cpu: stoppedCpu,
        }),
      ),
    )
  }).pipe(Effect.provide(TestClock.layer()))

/**
 * Runs the tracker over the timetable source's plan: no call to keep or replay, so freezing it and
 * checking it again are the same run.
 */
export const onTimetable = (plan: TimetablePlan, timetable: Timetable): Effect.Effect<Served> =>
  play(plan).pipe(
    Effect.provide(trackerLayer({ timetable, source: { kind: 'timetable' }, cpu: stoppedCpu })),
    Effect.provide(TestClock.layer()),
  )
