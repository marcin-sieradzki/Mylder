// Freezing and replaying recordings: the tracker runs over a plan's minutes on the test clock,
// once against the simulated Rejseplanen with every answer kept, and once against the recorded
// layer, and both give the same snapshots (docs/testing-seams.md).
import 'server-only'
import { join } from 'node:path'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { serviceOf, type Service } from '../rejseplanen/answers.ts'
import * as Http from '../rejseplanen/http.ts'
import { trackerLayer } from '../runtime.ts'
import { simulatedClient } from '../simulation/layer.ts'
import type { Snapshot } from '../snapshot.ts'
import type { Source } from '../source.ts'
import { loadTimetable, type Timetable } from '../timetable.ts'
import { Tracker } from '../tracker.ts'
import * as RecordedHttpClient from './layer.ts'
import type { Calls, Recorded } from './layer.ts'
import type { RecordingPlan } from './plans.ts'

const MINUTE = 60_000

/** A frozen recording: each service's calls in order, and the snapshot of every minute. */
export interface Frozen {
  readonly calls: Calls
  readonly snapshots: readonly Snapshot[]
}

const sourceOf = (plan: RecordingPlan): Source => ({ kind: 'recording', folder: plan.name })

/** The tracker's snapshot at the start of each of a plan's minutes. */
const play = (plan: RecordingPlan) =>
  Effect.gen(function* () {
    const tracker = yield* Tracker
    const snapshots: Snapshot[] = []
    for (let minute = 0; minute < plan.minutes; minute++) {
      yield* TestClock.setTime(plan.start + minute * MINUTE)
      snapshots.push(yield* tracker.getSnapshot)
    }
    return snapshots
  })

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
  const calls = new Map<Service, Recorded[]>()
  const simulation = simulatedClient({ timetable, scenario: plan.scenario })
  const taped = Http.client((request, url) =>
    Effect.gen(function* () {
      const response = yield* simulation.execute(request)
      const text = yield* Effect.orDie(response.text)
      let recorded = recordedOf(response.status, text)
      const service = serviceOf(url)
      if (service === 'journeyPos' && plan.fill && 'answer' in recorded) {
        recorded = { answer: fillJourneys(recorded.answer, plan.fill) }
      }
      if (service) calls.set(service, [...(calls.get(service) ?? []), recorded])
      return yield* RecordedHttpClient.answer(request, recorded)
    }),
  )
  return play(plan).pipe(
    Effect.provide(trackerLayer({ timetable, source: sourceOf(plan), http: Http.layer(taped) })),
    Effect.provide(TestClock.layer()),
    Effect.map((snapshots) => ({ calls, snapshots })),
  )
}

/** Runs the tracker over a plan against its recording folder, as it ran when it was frozen. */
export const replay = (plan: RecordingPlan, dir: string): Effect.Effect<readonly Snapshot[]> =>
  Effect.gen(function* () {
    const timetable = yield* Effect.promise(() => loadTimetable(join(dir, 'timetable')))
    return yield* play(plan).pipe(
      Effect.provide(
        trackerLayer({ timetable, source: sourceOf(plan), http: RecordedHttpClient.layer(dir) }),
      ),
    )
  }).pipe(Effect.provide(TestClock.layer()))
