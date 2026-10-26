// The tracker run (docs/live-data.md, "One call a minute"): whoever asks, at most once a poll
// interval, take the lease for the run or serve the stored snapshot; set the budget level and,
// unless the month is spent, call `journeyPos` for the city box in the configured position mode;
// join the answer to the timetable and the stored
// history, run the domain rules for every trip on the map, store the snapshot and the history,
// and return the snapshot. A failed or empty call keeps every trip's history, so trips age by the
// clock. The stop and trip answers come from the timetable plus the snapshot's delays until
// on-demand calls are wired (#32).
import 'server-only'
import { Clock, Context, Effect, Layer, Result } from 'effect'
import { timedCalls } from '../domain/trip-motion.ts'
import { COPENHAGEN_BOX, type Mode } from '../timetable/format.ts'
import { platformId } from '../timetable/stops.ts'
import type { PlannedTrip } from '../timetable/trips.ts'
import { MIN_CDN_SECONDS } from './caching.ts'
import { buildTrips, expectedUnderway, type History, type PositionAnswer } from './build.ts'
import { monthOf, pacing, type Pacing } from './budget.ts'
import { answerOutcome, failureOutcome, healthAfter, type Outcome } from './health.ts'
import { callsKey, Rejseplanen, type CallError } from './rejseplanen/client.ts'
import type { Snapshot, SnapshotTrip } from './snapshot.ts'
import type { Source } from './source.ts'
import { Store } from './store.ts'
import type { Timetable } from './timetable.ts'

/** Every product that runs on a line (docs/live-data.md): trains, S-tog, buses, ferries, Metro, light rail. */
export const PRODUCTS = 3839

/** The most journeys one answer may hold. */
export const MAX_JOURNEYS = 1000

/** How long a stop's departures look ahead. */
export const DEPARTURES_AHEAD = 60 * 60_000

/** The most departures a stop's answer lists. */
export const MAX_DEPARTURES = 30

export type PositionMode = Snapshot['positionMode']

export interface TrackerSettings {
  readonly source: Source
  readonly positionMode: PositionMode
  /** What the store's keys are kept under, so each source has its own state. */
  readonly keyPrefix: string
}

export class TrackerConfig extends Context.Service<TrackerConfig, TrackerSettings>()(
  'mylder/tracker/TrackerConfig',
) {}

export class TimetableService extends Context.Service<TimetableService, Timetable>()(
  'mylder/tracker/Timetable',
) {}

/** One departure from a stop: the timetable's time plus the snapshot's delay for its trip. */
export interface StopDeparture {
  readonly trip: string
  readonly line: string
  readonly mode: Mode
  readonly headsign: string
  readonly platform: string
  readonly scheduled: number
  readonly expected?: number
  readonly state: SnapshotTrip['state']
}

export interface StopDepartures {
  readonly stop: { readonly id: string; readonly name: string }
  /** The snapshot the delays came from, and when the next one is due. */
  readonly fetched: number
  readonly nextDue: number
  readonly departures: readonly StopDeparture[]
}

export interface TripCall {
  readonly index: number
  readonly stop: string
  readonly name: string
  readonly arrival: number
  readonly departure: number
  readonly expectedArrival?: number
  readonly expectedDeparture?: number
}

export interface TripDetail {
  readonly key: string
  readonly line: string
  readonly mode: Mode
  readonly headsign: string
  readonly pattern: number
  readonly state: SnapshotTrip['state']
  readonly delay?: number
  readonly fetched: number
  readonly nextDue: number
  readonly calls: readonly TripCall[]
}

export interface Disruptions {
  /** When the list was last fetched; null until the first `himsearch` (#57). */
  readonly fetched: number | null
  readonly ok: boolean
  readonly messages: readonly unknown[]
}

export interface TrackerShape {
  readonly getSnapshot: Effect.Effect<Snapshot>
  readonly getStopDepartures: (stopId: string) => Effect.Effect<StopDepartures | undefined>
  readonly getTripDetail: (tripKey: string) => Effect.Effect<TripDetail | undefined>
  readonly getDisruptions: Effect.Effect<Disruptions>
  /** The tracker's own clock, which a recording sets, for the routes' cache headers. */
  readonly now: Effect.Effect<number>
}

export class Tracker extends Context.Service<Tracker, TrackerShape>()('mylder/tracker/Tracker') {}

/**
 * The mode an alternating tracker asks in: the other one from the previous run's, so each comes
 * every other run at any poll interval. With no previous run, reports on odd minutes, computed
 * on even.
 */
export function alternatingMode(previous: Snapshot['answerMode'], now: number) {
  if (previous) return previous === 'REPORT_ONLY' ? 'CALC_REPORT' : 'REPORT_ONLY'
  return Math.floor(now / 60_000) % 2 === 1 ? 'REPORT_ONLY' : 'CALC_REPORT'
}

const SNAPSHOT_SECONDS = 86_400

/** How long a run's lease holds: past any run, which a call's two 8 s attempts bound. */
const LEASE_SECONDS = 60

/** How long a quota error is kept: past the end of any month it falls in. */
const QUOTA_SECONDS = 32 * 86_400

/** A source as the snapshot names it. */
export const describeSource = (source: Source): Snapshot['source'] =>
  source.kind === 'simulated'
    ? { kind: 'simulated', name: source.scenario }
    : source.kind === 'recording'
      ? { kind: 'recording', name: source.folder }
      : { kind: 'rejseplanen' }

export const layer: Layer.Layer<
  Tracker,
  never,
  TrackerConfig | TimetableService | Store | Rejseplanen
> = Layer.effect(
  Tracker,
  Effect.gen(function* () {
    const config = yield* TrackerConfig
    const timetable = yield* TimetableService
    const store = yield* Store
    const rejseplanen = yield* Rejseplanen
    const key = (name: string) => `${config.keyPrefix}:${name}`
    const { timezone } = timetable.manifest

    // The in-memory store keeps the snapshot and history as built; the Redis adapter (#56)
    // decodes them on the way back.
    const stored = store
      .get(key('snapshot'))
      .pipe(Effect.map((value) => value as Snapshot | undefined))
    const storedHistory = store
      .get(key('history'))
      .pipe(Effect.map((value) => value as History | undefined))

    /** The month's calls so far. */
    const callsIn = (month: string) =>
      store
        .get(callsKey(config.keyPrefix, month))
        .pipe(Effect.map((calls) => (typeof calls === 'number' ? calls : 0)))

    /** Where a quota error is remembered, so the month stays spent until the 1st. */
    const quotaKey = (month: string) => key(`quota:${month}`)

    /** The month's pacing from its counter and any quota error this month. */
    const paceAt = (now: number) =>
      Effect.gen(function* () {
        const month = monthOf(now, timezone).key
        return pacing({
          calls: yield* callsIn(month),
          now,
          timezone,
          quotaGone: (yield* store.get(quotaKey(month))) === true,
        })
      })

    /**
     * Builds a snapshot at a moment from the history and, when a call made one, an answer, and
     * the history to keep.
     */
    const snapshotAt = (
      now: number,
      previous: Snapshot | undefined,
      before: Pacing,
      outcome: {
        mode?: PositionAnswer['mode']
        answer?: PositionAnswer
        health: Outcome
        apiTime?: string
        calls: Snapshot['status']['calls']
      },
    ) =>
      Effect.gen(function* () {
        const api = healthAfter(previous?.api, outcome.health, now)
        // The level set before the call holds, unless Rejseplanen has just called the month spent.
        const pace =
          outcome.health.status === 'spent' && before.level !== 'spent'
            ? pacing({ calls: before.calls, now, timezone, quotaGone: true })
            : before
        const { trips, unmatched, history } = buildTrips({
          timetable,
          now,
          answer: outcome.answer,
          history: yield* storedHistory,
          context: {
            pollInterval: pace.pollInterval,
            positionMode: config.positionMode,
            health: api,
          },
        })
        const states: Record<string, number> = {}
        for (const trip of trips) states[trip.state] = (states[trip.state] ?? 0) + 1
        const snapshot: Snapshot = {
          fetched: now,
          nextDue: now + pace.pollInterval * 1000,
          pollInterval: pace.pollInterval,
          serviceDay: timetable.serviceDaysAt(now).at(-1)!,
          timetableVersion: timetable.manifest.version,
          positionMode: config.positionMode,
          ...(config.positionMode === 'alternating' && outcome.mode
            ? { answerMode: outcome.mode }
            : {}),
          ...(outcome.apiTime ? { apiTime: outcome.apiTime } : {}),
          api,
          budget: {
            level: pace.level,
            calls: yield* callsIn(pace.month.key),
            ...(pace.resumes ? { resumes: pace.resumes } : {}),
          },
          store: 'ok',
          disruptions: null,
          source: describeSource(config.source),
          status: { calls: outcome.calls, unmatched, states },
          trips,
        }
        return { snapshot, history }
      })

    /** One run: the budget, the call, the build. */
    const run = (now: number, previous: Snapshot | undefined) =>
      Effect.gen(function* () {
        const pace = yield* paceAt(now)
        // A spent month makes no call: the trips move on and age from their history alone, and
        // the modes take turns again from where they stopped.
        if (pace.level === 'spent') {
          return yield* snapshotAt(now, previous, pace, {
            ...(previous?.answerMode ? { mode: previous.answerMode } : {}),
            health: { status: 'spent' },
            calls: [],
          })
        }
        const mode =
          config.positionMode === 'alternating'
            ? alternatingMode(previous?.answerMode, now)
            : config.positionMode
        if (mode === 'none') {
          return yield* snapshotAt(now, previous, pace, { health: { status: 'ok' }, calls: [] })
        }
        const result = yield* Effect.result(
          rejseplanen.journeyPos({
            box: COPENHAGEN_BOX,
            products: PRODUCTS,
            positionMode: mode,
            maxJny: MAX_JOURNEYS,
          }),
        )
        if (Result.isSuccess(result)) {
          const { answer, attempts, ms } = result.success
          const journeys = answer.Journey ?? []
          const health = answerOutcome(journeys.length, expectedUnderway(timetable, now))
          return yield* snapshotAt(now, previous, pace, {
            mode,
            answer: { journeys, mode },
            health,
            ...(answer.planRtTs ? { apiTime: answer.planRtTs } : {}),
            calls: [{ service: 'journeyPos', outcome: health.status, attempts, ms }],
          })
        }
        // A failed run builds from the history alone, so every trip keeps moving on its timeline
        // and ages by the rules (docs/live-data.md, "What can go wrong"). The message carries no key.
        const error: CallError = result.failure
        yield* Effect.logWarning(`Tracker run: ${error.message}`)
        // A quota error holds until the 1st; a refused key is tried again at the next run.
        if (error.kind === 'quota') yield* store.set(quotaKey(pace.month.key), true, QUOTA_SECONDS)
        return yield* snapshotAt(now, previous, pace, {
          mode,
          health: failureOutcome(error),
          calls: [{ service: 'journeyPos', outcome: error.kind, attempts: error.attempts, ms: 0 }],
        })
      })

    const getSnapshot = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const previous = yield* stored
      if (previous && now < previous.nextDue) return previous
      // One lease for each run, named by the moment it falls due, so whatever the poll interval
      // only one request makes it.
      const lease = key(`lease:${previous?.nextDue ?? 'first'}`)
      const leased = yield* store.setIfAbsent(lease, now, LEASE_SECONDS)
      if (!leased) {
        // Another request holds this run: serve what is stored, or the timetable alone, due
        // again in a few seconds so the CDN asks soon.
        if (previous) return previous
        const { snapshot } = yield* snapshotAt(now, previous, yield* paceAt(now), {
          health: { status: 'ok' },
          calls: [],
        })
        return { ...snapshot, nextDue: now + MIN_CDN_SECONDS * 1000 }
      }
      const { snapshot, history } = yield* run(now, previous)
      yield* store.set(key('snapshot'), snapshot, SNAPSHOT_SECONDS)
      yield* store.set(key('history'), history, SNAPSHOT_SECONDS)
      return snapshot
    })

    /** The snapshot's trips by key, for the stop and trip answers. */
    const tripsByKey = (snapshot: Snapshot) =>
      new Map(snapshot.trips.map((trip) => [trip.key, trip]))

    /** A planned trip of the service days running now, by its key. */
    const plannedTrip = (tripKey: string, now: number): PlannedTrip | undefined => {
      for (const day of timetable.serviceDaysAt(now)) {
        const trip = timetable.tripsOn(day).find((each) => each.key === tripKey)
        if (trip) return trip
      }
      return undefined
    }

    /** A trip's calls shifted by the snapshot's delay for it, when it has one. */
    const withDelay = (trip: PlannedTrip, delay: number | undefined) =>
      delay === undefined ? undefined : timedCalls(trip.calls, delay)

    const { platforms, stops } = timetable.stops
    const platformIdOf = (platform: number) => platforms[platform].id

    /** A stop by its own id, or by the id of one of its platforms. */
    const stopIndexOf = (id: string) => {
      const byStop = stops.findIndex((stop) => stop.id === id)
      if (byStop >= 0) return byStop
      const platform = platforms.findIndex((each) => each.id === platformId(id))
      return platform >= 0 ? platforms[platform].stop : -1
    }

    const getStopDepartures = (stopId: string) =>
      Effect.gen(function* () {
        const stopIndex = stopIndexOf(stopId)
        if (stopIndex < 0) return undefined
        const snapshot = yield* getSnapshot
        const now = snapshot.fetched
        const onMap = tripsByKey(snapshot)
        const departures: StopDeparture[] = []
        for (const day of timetable.serviceDaysAt(now)) {
          for (const trip of timetable.tripsOn(day)) {
            const live = onMap.get(trip.key)
            let expected: ReturnType<typeof withDelay> | null = null
            trip.calls.forEach((call, i) => {
              if (i === trip.calls.length - 1 || platforms[call.platform].stop !== stopIndex) return
              // Shift the trip's calls once, and only for a trip that calls here.
              if (expected === null) expected = withDelay(trip, live?.delay)
              const leaves = expected?.[i].departure ?? call.departure
              if (leaves < now || leaves > now + DEPARTURES_AHEAD) return
              departures.push({
                trip: trip.key,
                line: trip.line.name,
                mode: trip.line.mode,
                headsign: trip.headsign,
                platform: platformIdOf(call.platform),
                scheduled: call.departure,
                ...(expected ? { expected: leaves } : {}),
                state: live?.state ?? 'timetable-only',
              })
            })
          }
        }
        departures.sort((a, b) => (a.expected ?? a.scheduled) - (b.expected ?? b.scheduled))
        const stop = stops[stopIndex]
        return {
          stop: { id: stop.id, name: stop.name },
          fetched: now,
          nextDue: snapshot.nextDue,
          departures: departures.slice(0, MAX_DEPARTURES),
        }
      })

    const getTripDetail = (tripKey: string) =>
      Effect.gen(function* () {
        const trip = plannedTrip(tripKey, yield* Clock.currentTimeMillis)
        if (!trip) return undefined
        const snapshot = yield* getSnapshot
        const live = tripsByKey(snapshot).get(trip.key)
        const expected = withDelay(trip, live?.delay)
        return {
          key: trip.key,
          line: trip.line.name,
          mode: trip.line.mode,
          headsign: trip.headsign,
          pattern: trip.pattern,
          state: live?.state ?? 'timetable-only',
          ...(live?.delay === undefined ? {} : { delay: live.delay }),
          fetched: snapshot.fetched,
          nextDue: snapshot.nextDue,
          calls: trip.calls.map((call, index) => ({
            index,
            stop: platformIdOf(call.platform),
            name: platforms[call.platform].name,
            arrival: call.arrival,
            departure: call.departure,
            ...(expected
              ? {
                  expectedArrival: expected[index].arrival,
                  expectedDeparture: expected[index].departure,
                }
              : {}),
          })),
        }
      })

    return {
      getSnapshot,
      getStopDepartures,
      getTripDetail,
      getDisruptions: Effect.succeed({ fetched: null, ok: false, messages: [] }),
      now: Clock.currentTimeMillis,
    }
  }),
)

/** The Rejseplanen client's settings for a tracker: its counters live under the tracker's keys. */
export const clientSettings = (settings: TrackerSettings, timetable: Timetable, key?: string) => ({
  ...(key ? { key } : {}),
  counterPrefix: settings.keyPrefix,
  monthOf: (now: number) => monthOf(now, timetable.manifest.timezone).key,
})
