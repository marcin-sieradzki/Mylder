import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer, Logger } from 'effect'
import { TestClock } from 'effect/testing'
import { addDays } from '../timetable/dates'
import * as Http from './rejseplanen/http'
import { CpuClock } from './report'
import { trackerLayer } from './runtime'
import type { Snapshot } from './snapshot'
import { readSource } from './source'
import { fixtureTimetable } from './testing'
import type { Timetable } from './timetable'
import { Tracker } from './tracker'

// Each run's report (docs/live-data.md, "Watching it"): one log line, and the same figures in
// the snapshot's status section. 07:20 in Copenhagen on Tuesday 2026-06-16; the fixture was
// prepared on 2 June.
const MOMENT = Date.UTC(2026, 5, 16, 5, 20, 30)
const TODAY = '2026-06-16'
const KEY = 'test-key-4f9c'

const fixture = await fixtureTimetable()
const simulated = readSource('simulated')

/** A CPU clock that moves 7 ms each time it is read, so a run measures 7 ms. */
const ticking = () => {
  let used = 0
  return Layer.succeed(
    CpuClock,
    Effect.sync(() => (used += 7)),
  )
}

/** The fixture with its manifest's last day and prepared date moved. */
const preparedWith = (last: string, prepared: string): Timetable => ({
  ...fixture,
  manifest: {
    ...fixture.manifest,
    preparedDate: prepared,
    window: { ...fixture.manifest.window, last },
  },
})

interface Logged {
  readonly level: string
  readonly message: unknown
  readonly cause: string
}

/** The tracker, with every log it writes kept in `logged`. */
const tracker = (
  logged: Logged[],
  options: { timetable?: Timetable; http?: Layer.Layer<Http.HttpClient.HttpClient> } = {},
) =>
  Layer.merge(
    trackerLayer({
      timetable: options.timetable ?? fixture,
      source: simulated,
      positionMode: 'CALC_REPORT',
      key: KEY,
      cpu: ticking(),
      ...(options.http ? { http: options.http } : {}),
    }),
    Logger.layer([
      Logger.make(
        ({ logLevel, message, cause }) =>
          void logged.push({ level: logLevel, message, cause: String(cause) }),
      ),
    ]),
  )

const snapshot = Effect.gen(function* () {
  return yield* (yield* Tracker).getSnapshot
})

/** The run lines among the logs: each one's figures. */
const runLines = (logged: readonly Logged[]) =>
  logged.flatMap(({ message }) =>
    Array.isArray(message) && message[0] === 'Tracker run' ? [message[1] as unknown] : [],
  )

describe('a tracker run’s report', () => {
  it.effect('logs one line per run with the figures the snapshot’s status section carries', () => {
    const logged: Logged[] = []
    return Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const s: Snapshot = yield* snapshot
      // A second request inside the poll interval makes no run, so no second line.
      yield* snapshot
      const lines = runLines(logged)
      expect(lines).toEqual([
        {
          source: { kind: 'simulated', name: 'weekday' },
          positionMode: 'CALC_REPORT',
          budget: { level: s.budget.level, calls: s.budget.calls },
          store: 'ok',
          ...s.status,
        },
      ])
      const { status } = s
      expect(status.calls.map(({ service, outcome }) => [service, outcome])).toEqual([
        ['journeyPos', 'ok'],
        ['himsearch', 'ok'],
      ])
      expect(status.cpuMs).toBe(7)
      expect(status.unmatched).toBe(0)
      const count = (counts: Record<string, number>) =>
        Object.values(counts).reduce((sum, each) => sum + each, 0)
      expect(count(status.modes)).toBe(s.trips.length)
      expect(count(status.states)).toBe(s.trips.length)
      expect(status.modes.bus).toBe(s.trips.filter((trip) => trip.mode === 'bus').length)
      expect(status.timetable).toEqual({
        prepared: '2026-06-02',
        last: fixture.manifest.window.last,
        daysLeft: expect.any(Number),
        daysOld: 14,
      })
      expect(s.timetableRunningOut).toBeUndefined()
    }).pipe(Effect.provide(tracker(logged)))
  })

  it.effect('logs a refused-key run without the key', () => {
    const logged: Logged[] = []
    // The refusal echoes the URL it was sent, key and all, as a server might.
    const refused = Http.layer(
      Http.client((request, url) =>
        Effect.succeed(Http.error(request, 401, 'API_AUTH', `refused ${url.href}`)),
      ),
    )
    return Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const s = yield* snapshot
      expect(s.api).toMatchObject({ status: 'spent', kind: 'refused' })
      const [line] = runLines(logged)
      expect(line).toMatchObject({
        calls: [{ service: 'journeyPos', outcome: 'refused', attempts: 1, status: 401 }],
      })
      // The refusal's warning and the run line.
      expect(logged.map(({ level }) => level)).toEqual(['Warn', 'Info'])
      expect(JSON.stringify(logged)).not.toContain(KEY)
    }).pipe(Effect.provide(tracker(logged, { http: refused })))
  })

  it.effect('marks the snapshot when the timetable has under 7 days left', () => {
    const logged: Logged[] = []
    return Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const s = yield* snapshot
      expect(s.status.timetable.daysLeft).toBe(6)
      expect(s.timetableRunningOut).toBe(true)
    }).pipe(
      Effect.provide(tracker(logged, { timetable: preparedWith(addDays(TODAY, 5), '2026-06-02') })),
    )
  })

  it.effect('leaves the snapshot unmarked with 7 days left', () => {
    const logged: Logged[] = []
    return Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const s = yield* snapshot
      expect(s.status.timetable.daysLeft).toBe(7)
      expect(s.timetableRunningOut).toBeUndefined()
    }).pipe(
      Effect.provide(tracker(logged, { timetable: preparedWith(addDays(TODAY, 6), '2026-06-02') })),
    )
  })

  it.effect('warns when the timetable was prepared more than 30 days ago', () => {
    const logged: Logged[] = []
    const warnings = () => logged.filter(({ level }) => level === 'Warn')
    return Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      yield* snapshot
      expect(warnings()).toHaveLength(1)
      expect(String(warnings()[0].message)).toContain('prepared 31 days ago, on 2026-05-16')
    }).pipe(
      Effect.provide(
        tracker(logged, {
          timetable: preparedWith(fixture.manifest.window.last, addDays(TODAY, -31)),
        }),
      ),
    )
  })

  it.effect('does not warn about a timetable prepared 30 days ago', () => {
    const logged: Logged[] = []
    return Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      yield* snapshot
      expect(logged.filter(({ level }) => level === 'Warn')).toEqual([])
    }).pipe(
      Effect.provide(
        tracker(logged, {
          timetable: preparedWith(fixture.manifest.window.last, addDays(TODAY, -30)),
        }),
      ),
    )
  })
})
