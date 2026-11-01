import { describe, expect, it } from '@effect/vitest'
import { Effect, Fiber, Layer, Logger, References } from 'effect'
import { TestClock } from 'effect/testing'
import { join } from 'node:path'
import { siriEtReader } from '../siri-et/reader'
import { readBox, readSiriEtMessages } from '../siri-et/recording'
import type { TableJourney } from '../siri-et/table'
import { createListener } from '../listener/listener'
import { portOf, serve } from '../listener/server'
import type { PlannedTrip } from '../timetable/trips'
import * as Http from './http'
import { recordingDir } from './recording/layer'
import { stoppedCpu } from './report'
import { trackerLayer } from './runtime'
import type { Snapshot, SnapshotTrip } from './snapshot'
import { loadTimetable } from './timetable'
import { Tracker } from './tracker'
import type { Updates } from './updates'

// SIRI-ET's delays on the map (spec #146, #213): the timetable source with `MYLDER_UPDATES` on the
// SIRI-ET recording, recordings/siri-et, whose reader runs inside the tracker over its messages at
// the test clock, joined to the trips of the recording's own timetable. Every expected delay is the
// reader's tests' (src/siri-et/reader.test.ts), read off the messages by hand.

const RECORDING = 'siri-et'
const timetable = await loadTimetable(join(recordingDir(RECORDING), 'timetable'))
const recorded: Updates = { kind: 'recording', folder: RECORDING }

/** The listener's address and token, as `MYLDER_UPDATES_URL` and `MYLDER_UPDATES_TOKEN` give them. */
const TOKEN = 'a-test-token-of-the-listener-0123456789abcdef'
const LISTENER = { url: 'https://listener.example/table', token: TOKEN }

/** A moment on Saturday 31 October 2026, Copenhagen time (UTC+1). */
const cph = (time: string) => Date.parse(`2026-10-31T${time}+01:00`)

/** The tracker on the timetable source with updates from `updates`. */
const onTimetable = (updates: Updates) =>
  trackerLayer({ timetable, source: { kind: 'timetable' }, updates, cpu: stoppedCpu })

/** The snapshot at a moment, Copenhagen time, its run's log line kept quiet. */
const snapshotAt = (time: string) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(cph(time))
    return yield* (yield* Tracker).getSnapshot
  }).pipe(Effect.provideService(References.MinimumLogLevel, 'Warn'))

/** The trip of a line whose first call is at `departs`, Copenhagen time, on the service day. */
const tripOf = (snapshot: Snapshot, line: string, departs: string): SnapshotTrip | undefined => {
  const trip = timetable
    .tripsOn('2026-10-31')
    .find((each) => each.line.name === line && each.calls[0].departure === cph(departs))
  return trip && snapshot.trips.find((each) => each.key === trip.key)
}

/** The planned call times of a snapshot trip, by call index. */
const planned = (trip: SnapshotTrip) =>
  timetable.tripsOn('2026-10-31').find((each) => each.key === trip.key)!.calls

describe('SIRI-ET’s delays from a recording, on the timetable source', () => {
  it.effect('gives a joined trip its update: Estimated, with its delay and expected calls', () =>
    Effect.gen(function* () {
      // Bus 68's first message, a whole trip of 30 calls from 09:03, 1 to 3 min early: 2 min
      // early from its first stop, 2256, and from Kigkurren's last step, 3153 at 09:42.
      const snapshot = yield* snapshotAt('09:02:00')
      const bus = tripOf(snapshot, '68', '09:03')
      expect(bus).toMatchObject({
        mode: 'bus',
        state: 'estimated',
        source: 'timetable',
        hadRealtime: true,
        delay: -120,
      })
      expect(bus?.updated).toBeLessThanOrEqual(cph('09:02:00'))
      // Placed from its timetable plus its delay: each next call 1 to 3 min ahead of its plan.
      const calls = planned(bus!)
      for (const next of bus!.next) {
        const late = (next.time - calls[next.index].departure) / 1000
        expect([-180, -120, -60]).toContain(late)
      }
    }).pipe(Effect.provide(onTimetable(recorded))),
  )

  it.effect(
    'marks the call a trip skips as cancelled, and serves it again when a message does',
    () =>
      Effect.gen(function* () {
        // Bus 68's Gyldenlandsvej (30090), due at 09:38, cancelled at 09:01 and served again at
        // 09:08:11.
        const before = tripOf(yield* snapshotAt('09:02:00'), '68', '09:03')
        const skipped = planned(before!).findIndex(
          (call) => call.departure === cph('09:38') || call.arrival === cph('09:38'),
        )
        expect(before?.cancelledCalls).toEqual([skipped])
        const after = tripOf(yield* snapshotAt('09:08:30'), '68', '09:03')
        expect(after?.cancelledCalls).toBeUndefined()
        expect(after?.state).toBe('estimated')
      }).pipe(Effect.provide(onTimetable(recorded))),
  )

  it.effect('joins a train by its train number', () =>
    Effect.gen(function* () {
      // IC 50118's messages of 09:00:29, 09:03:41 and 09:06:52: 9 min late away from 8600501,
      // due at 09:05, and so through the stops its messages leave out, until 8600512 at 09:29.
      const snapshot = yield* snapshotAt('09:07:00')
      const trip = timetable.tripsOn('2026-10-31').find((each) => each.number === '050118')
      const ic = snapshot.trips.find((each) => each.key === trip?.key)
      expect(ic).toMatchObject({ mode: 'train', state: 'estimated', hadRealtime: true })
      const stopAt = (index: number) => timetable.stops.platforms[trip!.calls[index].platform].id
      expect(
        ic?.next.map((next) => [
          stopAt(next.index),
          (next.time - trip!.calls[next.index].departure) / 1000,
        ]),
      ).toEqual([
        ['8600501', 540],
        ['8600502', 540],
        ['8600503', 540],
      ])
      expect(ic?.next[0].time).toBe(cph('09:14'))
    }).pipe(Effect.provide(onTimetable(recorded))),
  )

  it.effect('keeps a cancelled trip in the snapshot, marked, so the map leaves it out', () =>
    Effect.gen(function* () {
      // Bus 102A from 09:04: its last two calls cancelled at 09:19:32, the whole trip at 09:21:15.
      const before = tripOf(yield* snapshotAt('09:20:00'), '102A', '09:04')
      expect(before?.cancelled).toBeUndefined()
      expect(before?.cancelledCalls).toHaveLength(2)
      const after = tripOf(yield* snapshotAt('09:21:30'), '102A', '09:04')
      expect(after?.cancelled).toBe(true)
    }).pipe(Effect.provide(onTimetable(recorded))),
  )

  it.effect('leaves every Metro trip Timetable only, and counts what has an update by mode', () =>
    Effect.gen(function* () {
      const snapshot = yield* snapshotAt('09:30:00')
      const metro = snapshot.trips.filter((trip) => trip.mode === 'metro')
      expect(metro.length).toBeGreaterThan(0)
      for (const trip of metro) {
        expect(trip).toMatchObject({ state: 'timetable-only', hadRealtime: false })
        expect(trip.updated).toBeUndefined()
      }
      const withUpdate = (mode: string) =>
        snapshot.trips.filter((trip) => trip.mode === mode && trip.updated !== undefined).length
      expect(snapshot.updates).toMatchObject({
        kind: 'recording',
        fresh: true,
        withUpdate: {
          bus: withUpdate('bus'),
          train: withUpdate('train'),
          's-tog': withUpdate('s-tog'),
        },
      })
      expect(snapshot.updates.withUpdate.metro).toBeUndefined()
      expect(snapshot.updates.lastMessage).toBeGreaterThan(cph('09:29:00'))
      expect(snapshot.updates.lastMessage).toBeLessThanOrEqual(cph('09:30:00'))
      // Nothing is Live or Ageing without positions.
      expect(snapshot.status.states.live).toBeUndefined()
      expect(snapshot.status.states.ageing).toBeUndefined()
      // Trips with no update stay Timetable only.
      expect(snapshot.status.states['timetable-only']).toBeGreaterThan(metro.length)
    }).pipe(Effect.provide(onTimetable(recorded))),
  )

  it.effect('counts the journeys that join no trip, by mode', () =>
    Effect.gen(function* () {
      // Movia's line 19 runs between 56543 and 56444, and the timetable, cut to its box, has no
      // stop 56543, so no trip of the line starts or ends there.
      const snapshot = yield* snapshotAt('09:30:00')
      expect(snapshot.updates.unmatched.bus).toBeGreaterThan(0)
      expect(snapshot.updates.unmatched['s-tog']).toBeUndefined()
    }).pipe(Effect.provide(onTimetable(recorded))),
  )

  it.effect('logs the unmatched journeys and each mode’s share of trips with an update', () => {
    const lines: unknown[] = []
    const kept = Logger.layer([
      Logger.make(({ message }) => {
        if (Array.isArray(message) && message[0] === 'Tracker run') lines.push(message[1])
      }),
    ])
    return Effect.gen(function* () {
      yield* TestClock.setTime(cph('09:30:00'))
      const snapshot = yield* (yield* Tracker).getSnapshot
      const { modes } = snapshot.status
      const { withUpdate, unmatched, lastMessage } = snapshot.updates
      // Two decimals of each mode's trips on the map: none of the Metro's.
      const share = (mode: string) =>
        Math.round(((withUpdate[mode] ?? 0) / modes[mode]) * 100) / 100
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatchObject({
        updates: {
          kind: 'recording',
          fresh: true,
          lastMessage,
          unmatched,
          share: {
            bus: share('bus'),
            metro: 0,
            's-tog': share('s-tog'),
            train: share('train'),
          },
        },
      })
      expect(share('bus')).toBeGreaterThan(0.3)
    }).pipe(Effect.provide(Layer.merge(onTimetable(recorded), kept)))
  })

  it.effect('names updates off, with nothing to count, when the switch is off', () =>
    Effect.gen(function* () {
      const snapshot = yield* snapshotAt('09:30:00')
      expect(snapshot.updates).toEqual({ kind: 'off', fresh: false, withUpdate: {}, unmatched: {} })
      for (const trip of snapshot.trips) expect(trip.state).toBe('timetable-only')
    }).pipe(Effect.provide(onTimetable({ kind: 'off' }))),
  )
})

describe('SIRI-ET’s delays from the listener’s table, fetched over HTTPS', () => {
  /** The reader's table at a moment, Copenhagen time, as the listener would serve it then. */
  const listenersTable = async (time: string) => {
    const dir = recordingDir(RECORDING)
    const [messages, box] = await Promise.all([
      readSiriEtMessages(join(dir, 'messages.jsonl.gz')),
      readBox(join(dir, 'timetable')),
    ])
    const reader = siriEtReader({ box, listener: { version: 'test', startedAt: cph('09:00:00') } })
    for (const message of messages) if (message.receivedAt <= cph(time)) reader.receive(message)
    return reader.table(cph(time))
  }

  /** The tracker on the timetable source, reading the listener's table through `http`. */
  const onListener = (http: Layer.Layer<Http.HttpClient.HttpClient>) =>
    trackerLayer({
      timetable,
      source: { kind: 'timetable' },
      updates: { kind: 'siri' },
      listener: LISTENER,
      updatesHttp: http,
      cpu: stoppedCpu,
    })

  /** A listener whose route answers each request with the token as `answer` says. */
  const listenerAnswering = (
    answer: (request: Http.Request) => Effect.Effect<Http.Response>,
  ): Layer.Layer<Http.HttpClient.HttpClient> =>
    Http.layer(
      Http.client((request, url) =>
        url.href === LISTENER.url && request.headers.authorization === `Bearer ${TOKEN}`
          ? answer(request)
          : Effect.succeed(Http.text(request, 401, '')),
      ),
    )

  /** A listener serving `table`, as JSON once the gzip is undone. */
  const serving = (table: unknown) =>
    listenerAnswering((request) => Effect.succeed(Http.json(request, 200, table)))

  /** The snapshot at a moment, Copenhagen time, with the tracker reading through `http`. */
  const fromListener = (time: string, http: Layer.Layer<Http.HttpClient.HttpClient>) =>
    snapshotAt(time).pipe(Effect.provide(onListener(http)))

  it.effect('gives the same trips as the reader inside the tracker, from one fetch a run', () =>
    Effect.gen(function* () {
      // The listener's own route, on a port of this machine, fed the recording's messages up to
      // 09:21:30, when bus 102A of 09:04 has been cancelled whole for 15 s, beside every delay
      // the table holds then.
      const dir = recordingDir(RECORDING)
      const [messages, box] = yield* Effect.promise(() =>
        Promise.all([
          readSiriEtMessages(join(dir, 'messages.jsonl.gz')),
          readBox(join(dir, 'timetable')),
        ]),
      )
      const listener = createListener({
        token: TOKEN,
        version: 'test',
        startedAt: cph('09:00:00'),
        now: () => cph('09:21:30'),
      })
      for (const message of messages) {
        if (message.receivedAt <= cph('09:21:30')) listener.receive(message)
      }
      listener.useBox(box)
      const server = yield* Effect.acquireRelease(
        Effect.promise(() => serve(listener.handle, 0, '127.0.0.1')),
        (started) => Effect.promise(() => new Promise((done) => started.close(done))),
      )
      const served = yield* snapshotAt('09:21:30').pipe(
        Effect.provide(
          trackerLayer({
            timetable,
            source: { kind: 'timetable' },
            updates: { kind: 'siri' },
            listener: { url: `http://127.0.0.1:${portOf(server)}/table`, token: TOKEN },
            cpu: stoppedCpu,
          }),
        ),
      )
      const replayed = yield* snapshotAt('09:21:30').pipe(Effect.provide(onTimetable(recorded)))
      expect(listener.minute().requests).toEqual({ served: 1, refused: 0, unavailable: 0 })
      expect(served.trips).toEqual(replayed.trips)
      expect(served.updates).toEqual({ ...replayed.updates, kind: 'siri' })
      expect(tripOf(served, '102A', '09:04')?.cancelled).toBe(true)
    }).pipe(Effect.scoped),
  )

  it.effect('joins no journey to a Metro or light rail trip, which stay Timetable only', () =>
    Effect.gen(function* () {
      // No dataset carries the Metro or the light rail, so these journeys are made up: each names
      // a trip underway at 09:21:30, its line, its first and last stops and its first call, 5 min
      // late from its second call, as a SIRI-ET journey of it would.
      const moment = cph('09:21:30')
      const { platforms } = timetable.stops
      const underway = (mode: string) =>
        timetable
          .tripsOn('2026-10-31')
          .find(
            (trip) =>
              trip.line.mode === mode &&
              trip.calls[0].departure < moment &&
              trip.calls.at(-1)!.arrival > moment + 600_000,
          )!
      const journeyOf = (trip: PlannedTrip, n: number): TableJourney => {
        const at = (call: PlannedTrip['calls'][number]) => platforms[call.platform].id
        return {
          dataset: '788',
          day: '2026-10-31',
          journey: `made-up-${n}`,
          line: trip.line.name,
          origin: at(trip.calls[0]),
          destination: at(trip.calls.at(-1)!),
          received: cph('09:21:00'),
          first: { stop: at(trip.calls[0]), aimed: trip.calls[0].departure },
          steps: [{ stop: at(trip.calls[1]), aimed: trip.calls[1].departure, delay: 300 }],
        }
      }
      const metro = underway('metro')
      const lightRail = underway('light-rail')
      const table = yield* Effect.promise(() => listenersTable('09:21:30'))
      const made = {
        ...table,
        journeys: [...table.journeys, journeyOf(metro, 1), journeyOf(lightRail, 2)],
      }
      const before = yield* fromListener('09:21:30', serving(table))
      const after = yield* fromListener('09:21:30', serving(made))
      for (const trip of [metro, lightRail]) {
        const drawn = after.trips.find((each) => each.key === trip.key)
        expect(drawn).toMatchObject({ state: 'timetable-only', hadRealtime: false })
        expect(drawn?.updated).toBeUndefined()
        expect(drawn?.delay).toBeUndefined()
      }
      expect(after.updates.unmatched.bus).toBe((before.updates.unmatched.bus ?? 0) + 2)
    }),
  )

  /** The lines a run logs, as text, with the snapshot it gives at 09:21:30 through `http`. */
  const loggedRun = (http: Layer.Layer<Http.HttpClient.HttpClient>) => {
    const lines: string[] = []
    const kept = Logger.layer([
      Logger.make(({ message, logLevel }) => lines.push(`${logLevel} ${JSON.stringify(message)}`)),
    ])
    return Effect.gen(function* () {
      yield* TestClock.setTime(cph('09:21:30'))
      const run = yield* Effect.forkChild((yield* Tracker).getSnapshot)
      // Past the listener's timeout, so a fetch that never answers gives up.
      yield* TestClock.adjust('10 seconds')
      const snapshot = yield* Fiber.join(run)
      return { snapshot, lines }
    }).pipe(Effect.provide(Layer.merge(onListener(http), kept)))
  }

  /** No table: every trip Timetable only, and the feed named but not fresh. */
  const expectNoTable = (snapshot: Snapshot) => {
    expect(snapshot.updates).toEqual({ kind: 'siri', fresh: false, withUpdate: {}, unmatched: {} })
    expect(new Set(snapshot.trips.map((trip) => trip.state))).toEqual(new Set(['timetable-only']))
  }

  it.effect.each([
    {
      case: 'a fetch that never answers',
      http: listenerAnswering(() => Effect.never),
      logged: /listener’s table took over 3 seconds/,
    },
    {
      case: 'a fetch the network fails',
      http: Http.layer(Http.client(Http.unreachable)),
      logged: /listener’s table couldn’t be fetched/,
    },
    {
      case: 'a request the listener refuses',
      http: Http.layer(Http.client((request) => Effect.succeed(Http.text(request, 401, '')))),
      logged: /listener answered 401/,
    },
    {
      case: 'a listener with no table yet',
      http: listenerAnswering((request) => Effect.succeed(Http.text(request, 503, ''))),
      logged: /listener answered 503/,
    },
    {
      case: 'an answer that isn’t JSON',
      http: listenerAnswering((request) => Effect.succeed(Http.text(request, 200, '<html>'))),
      logged: /listener’s table fails its schema/,
    },
  ])('treats $case as no table, and logs it without the token', ({ http, logged }) =>
    Effect.gen(function* () {
      const { snapshot, lines } = yield* loggedRun(http)
      expectNoTable(snapshot)
      expect(lines.filter((line) => line.startsWith('Warn')).join('\n')).toMatch(logged)
      for (const line of lines) expect(line).not.toContain(TOKEN)
    }),
  )

  it.effect('treats a table built over 10 minutes ago as no table, and logs it', () =>
    Effect.gen(function* () {
      // A listener that stopped building at 09:11:00 and still answers with its last table.
      const table = yield* Effect.promise(() => listenersTable('09:11:00'))
      const { snapshot, lines } = yield* loggedRun(serving(table))
      expectNoTable(snapshot)
      expect(lines.join('\n')).toMatch(/listener’s table was built at 2026-10-31T08:11:00\.000Z/)
      // One built 9 minutes ago is still read.
      const recent = yield* Effect.promise(() => listenersTable('09:12:30'))
      const read = yield* loggedRun(serving(recent))
      expect(read.snapshot.updates.lastMessage).toBeGreaterThan(cph('09:12:00'))
    }),
  )

  it.effect('treats a table of another version as no table, and logs it', () =>
    Effect.gen(function* () {
      const table = yield* Effect.promise(() => listenersTable('09:21:30'))
      const { snapshot, lines } = yield* loggedRun(serving({ ...table, version: 2 }))
      expectNoTable(snapshot)
      expect(lines.join('\n')).toMatch(/listener’s table fails its schema \(version 2\)/)
    }),
  )

  it.effect('logs a missing address each run, and reads no table', () =>
    Effect.gen(function* () {
      const lines: string[] = []
      const kept = Logger.layer([
        Logger.make(({ message, logLevel }) => lines.push(`${logLevel} ${String(message)}`)),
      ])
      const snapshot = yield* snapshotAt('09:21:30').pipe(
        Effect.provide(
          Layer.merge(
            trackerLayer({
              timetable,
              source: { kind: 'timetable' },
              updates: { kind: 'siri' },
              updatesHttp: serving({}),
              cpu: stoppedCpu,
            }),
            kept,
          ),
        ),
      )
      expectNoTable(snapshot)
      expect(lines.join('\n')).toMatch(/Error .*MYLDER_UPDATES_URL and MYLDER_UPDATES_TOKEN/)
    }),
  )
})
