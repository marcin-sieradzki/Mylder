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
import { disruptionsEvery, monthOf, pacing, type Pacing } from './budget.ts'
import {
  failedList,
  fetchDue,
  fetchedList,
  servedList,
  summaryOf,
  type DisruptionList,
  type Disruptions,
} from './disruptions.ts'
import { answerOutcome, failureOutcome, healthAfter, type Outcome } from './health.ts'
import { countBy, CpuClock, RUNNING_OUT_DAYS, runLine, STALE_DAYS, timetableAge } from './report.ts'
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

/** A failed call as the status section lists it. */
const callFailed = (error: CallError): Snapshot['status']['calls'][number] => ({
  service: error.service,
  outcome: error.kind,
  attempts: error.attempts,
  ms: error.ms ?? 0,
  ...(error.status === undefined ? {} : { status: error.status }),
})

/** How a run's calls went, for the snapshot it builds. */
interface RunOutcome {
  /** The mode the run asked in, for alternating mode's turns. */
  readonly mode?: PositionAnswer['mode']
  readonly answer?: PositionAnswer
  readonly health: Outcome
  readonly apiTime?: string
  readonly calls: Snapshot['status']['calls']
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

/** How long the disruption list is kept: a spent month's screen still shows its last list. */
const DISRUPTIONS_SECONDS = 32 * 86_400

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
  TrackerConfig | TimetableService | Store | Rejseplanen | CpuClock
> = Layer.effect(
  Tracker,
  Effect.gen(function* () {
    const config = yield* TrackerConfig
    const timetable = yield* TimetableService
    const store = yield* Store
    const rejseplanen = yield* Rejseplanen
    const cpu = yield* CpuClock
    const key = (name: string) => `${config.keyPrefix}:${name}`
    const { timezone } = timetable.manifest
    const area = { stops: timetable.stops, products: PRODUCTS, timezone }

    // The in-memory store keeps the snapshot and history as built; the Redis adapter (#56)
    // decodes them on the way back.
    const stored = store
      .get(key('snapshot'))
      .pipe(Effect.map((value) => value as Snapshot | undefined))
    const storedHistory = store
      .get(key('history'))
      .pipe(Effect.map((value) => value as History | undefined))
    const storedDisruptions = store
      .get(key('disruptions'))
      .pipe(Effect.map((value) => value as DisruptionList | undefined))

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
     * the history to keep. `cpuFrom` is the CPU clock when the run began.
     */
    const snapshotAt = (
      now: number,
      previous: Snapshot | undefined,
      before: Pacing,
      outcome: RunOutcome,
      cpuFrom: number,
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
        const serviceDay = timetable.serviceDaysAt(now).at(-1)!
        const age = timetableAge(timetable.manifest, serviceDay)
        const snapshot: Snapshot = {
          fetched: now,
          nextDue: now + pace.pollInterval * 1000,
          pollInterval: pace.pollInterval,
          serviceDay,
          timetableVersion: timetable.manifest.version,
          ...(age.daysLeft < RUNNING_OUT_DAYS ? { timetableRunningOut: true as const } : {}),
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
          disruptions: summaryOf(yield* storedDisruptions),
          source: describeSource(config.source),
          status: {
            calls: outcome.calls,
            unmatched,
            modes: countBy(trips, 'mode'),
            states: countBy(trips, 'state'),
            cpuMs: Math.round((yield* cpu) - cpuFrom),
            timetable: age,
          },
          trips,
        }
        return { snapshot, history }
      })

    /** The positions call in the run's mode, and how it went. */
    const askPositions = (now: number, previous: Snapshot | undefined, pace: Pacing) =>
      Effect.gen(function* (): Effect.fn.Return<RunOutcome> {
        const mode =
          config.positionMode === 'alternating'
            ? alternatingMode(previous?.answerMode, now)
            : config.positionMode
        if (mode === 'none') return { health: { status: 'ok' }, calls: [] }
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
          return {
            mode,
            answer: { journeys, mode },
            health,
            ...(answer.planRtTs ? { apiTime: answer.planRtTs } : {}),
            calls: [{ service: 'journeyPos', outcome: health.status, attempts, ms }],
          }
        }
        // A failed run builds from the history alone, so every trip keeps moving on its timeline
        // and ages by the rules (docs/live-data.md, "What can go wrong").
        const error = yield* noteFailure(result.failure, pace)
        return {
          mode,
          health: failureOutcome(error),
          calls: [callFailed(error)],
        }
      })

    /**
     * Logs a failed call, whose message carries no key. A quota error holds until the 1st; a
     * refused key is tried again at the next run.
     */
    const noteFailure = (error: CallError, pace: Pacing) =>
      Effect.gen(function* () {
        yield* Effect.logWarning(`Tracker run: ${error.message}`)
        if (error.kind === 'quota') yield* store.set(quotaKey(pace.month.key), true, QUOTA_SECONDS)
        return error
      })

    /** Fetches the disruption list when it is due, keeping the last one if the fetch fails. */
    const refreshDisruptions = (now: number, pace: Pacing) =>
      Effect.gen(function* (): Effect.fn.Return<RunOutcome['calls']> {
        const list = yield* storedDisruptions
        if (!fetchDue(list, now, pace.disruptionsEvery)) return []
        const result = yield* Effect.result(rejseplanen.himsearch({ products: PRODUCTS }))
        if (Result.isSuccess(result)) {
          const { answer, attempts, ms } = result.success
          yield* store.set(
            key('disruptions'),
            fetchedList(answer.Message ?? [], now, area),
            DISRUPTIONS_SECONDS,
          )
          return [{ service: 'himsearch', outcome: 'ok', attempts, ms }]
        }
        const error = yield* noteFailure(result.failure, pace)
        yield* store.set(key('disruptions'), failedList(list, now), DISRUPTIONS_SECONDS)
        return [callFailed(error)]
      })

    /** One run: the budget, the calls, the build. */
    const run = (now: number, previous: Snapshot | undefined) =>
      Effect.gen(function* () {
        const cpuFrom = yield* cpu
        const pace = yield* paceAt(now)
        // A spent month makes no call: the trips move on and age from their history alone, and
        // the modes take turns again from where they stopped.
        if (pace.level === 'spent') {
          return yield* snapshotAt(
            now,
            previous,
            pace,
            {
              ...(previous?.answerMode ? { mode: previous.answerMode } : {}),
              health: { status: 'spent' },
              calls: [],
            },
            cpuFrom,
          )
        }
        const positions = yield* askPositions(now, previous, pace)
        // A refused key or a spent month refuses the disruption call too, so it isn't made.
        const disruptions =
          positions.health.status === 'spent' ? [] : yield* refreshDisruptions(now, pace)
        return yield* snapshotAt(
          now,
          previous,
          pace,
          { ...positions, calls: [...positions.calls, ...disruptions] },
          cpuFrom,
        )
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
        const { snapshot } = yield* snapshotAt(
          now,
          previous,
          yield* paceAt(now),
          { health: { status: 'ok' }, calls: [] },
          yield* cpu,
        )
        return { ...snapshot, nextDue: now + MIN_CDN_SECONDS * 1000 }
      }
      const { snapshot, history } = yield* run(now, previous)
      yield* store.set(key('snapshot'), snapshot, SNAPSHOT_SECONDS)
      yield* store.set(key('history'), history, SNAPSHOT_SECONDS)
      yield* Effect.logInfo('Tracker run', runLine(snapshot))
      const { prepared, daysOld } = snapshot.status.timetable
      if (daysOld > STALE_DAYS) {
        yield* Effect.logWarning(
          `Tracker run: the timetable was prepared ${daysOld} days ago, on ${prepared}; its job may have stopped`,
        )
      }
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

    /** The disruption list, due again at the next fetch its budget level allows. */
    const getDisruptions = Effect.gen(function* () {
      const snapshot = yield* getSnapshot
      const list = yield* storedDisruptions
      return servedList(list, disruptionsEvery(snapshot.budget.level), snapshot.nextDue)
    })

    return {
      getSnapshot,
      getStopDepartures,
      getTripDetail,
      getDisruptions,
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
