import { describe, expect, it } from '@effect/vitest'
import { Effect, type Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { disruptionKind, disruptionPhase } from '../domain/disruption'
import { pacing, SPENT_AT } from './budget'
import * as Http from './http'
import { error } from './rejseplanen/answers'
import { callsKey } from './rejseplanen/client'
import { keyPrefixOf, trackerLayer } from './runtime'
import { simulatedClient } from './simulation/layer'
import { readSource } from './source'
import { Store } from './store'
import { fixtureTimetable } from './testing'
import { Tracker } from './tracker'

// The disruption list (docs/live-data.md, "One call a minute", step 4): `himsearch` inside a
// tracker run, every 15 minutes, 30 when tight, never when spent. 07:20 in Copenhagen on
// Tuesday 2026-06-16, when the weekday scenario's S-tog signal fault is active.
const MOMENT = Date.UTC(2026, 5, 16, 5, 20, 30)
const ZONE = 'Europe/Copenhagen'

const timetable = await fixtureTimetable()
const weekday = readSource('simulated')
const prefix = keyPrefixOf(weekday)

const tracker = (http?: Layer.Layer<Http.HttpClient.HttpClient>) =>
  trackerLayer({
    timetable,
    source: weekday,
    positionMode: 'CALC_REPORT',
    ...(http ? { http } : {}),
  })

const snapshot = Effect.gen(function* () {
  return yield* (yield* Tracker).getSnapshot
})

/** The month's `himsearch` calls. */
const himsearchCalls = Effect.gen(function* () {
  const calls = yield* (yield* Store).get(callsKey(prefix, '2026-06', 'himsearch'))
  return typeof calls === 'number' ? calls : 0
})

/** Asks for a snapshot every `seconds` for `minutes`, as a watching browser does. */
const watch = (minutes: number, seconds: number) =>
  Effect.gen(function* () {
    for (let at = 0; at <= minutes * 60; at += seconds) {
      yield* snapshot
      yield* TestClock.adjust(`${seconds} seconds`)
    }
  })

/** The simulation, with `himsearch` answering 503 from its `failFrom`th call on. */
const himsearchFailing = (failFrom: number) => {
  let calls = 0
  const simulation = simulatedClient({ timetable })
  return Http.layer(
    Http.client((request, url) =>
      url.pathname.endsWith('himsearch') && ++calls >= failFrom
        ? Effect.succeed(Http.json(request, 503, {}))
        : simulation.execute(request).pipe(Effect.orDie),
    ),
  )
}

/** The simulation, with `himsearch` answering `answer` in place of its own. */
const himsearchAnswering = (answer: (request: Http.Request) => Http.Response) => {
  const simulation = simulatedClient({ timetable })
  return Http.layer(
    Http.client((request, url) =>
      url.pathname.endsWith('himsearch')
        ? Effect.succeed(answer(request))
        : simulation.execute(request).pipe(Effect.orDie),
    ),
  )
}

/** A message as `himsearch` encodes it, with the fields the filter reads. */
const message = (id: string, fields: object) => ({ id, head: id, ...fields })
const stop = (extId: string) => ({ name: extId, extId, lat: 55.7, lon: 12.6 })

describe('the tracker’s disruption list', () => {
  it.effect('fetches on the first run and then every 15 minutes', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      yield* watch(31, 60)
      // At 07:20:30, 07:35:30 and 07:50:30.
      expect(yield* himsearchCalls).toBe(3)
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('fetches every 30 minutes when the budget is tight', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const { line } = pacing({ calls: 0, now: MOMENT, timezone: ZONE })
      yield* (yield* Store).set(callsKey(prefix, '2026-06'), Math.ceil(line) + 1_600)
      yield* watch(61, 120)
      expect(yield* himsearchCalls).toBe(3)
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('never fetches when the month is spent', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      yield* (yield* Store).set(callsKey(prefix, '2026-06'), SPENT_AT)
      yield* watch(31, 60)
      expect(yield* himsearchCalls).toBe(0)
      expect((yield* snapshot).disruptions).toBeNull()
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('summarises the list in the snapshot and serves it, cached until the next fetch', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const s = yield* snapshot
      const list = yield* (yield* Tracker).getDisruptions
      expect(list.fetched).toBe(MOMENT)
      expect(list.checked).toBe(MOMENT)
      expect(list.ok).toBe(true)
      expect(list.nextDue).toBe(MOMENT + 15 * 60_000)
      expect(list.messages.length).toBeGreaterThan(0)
      // Messages pass through as received, each with its fields' kind and its validity in
      // Copenhagen's clock: the signal fault runs 05:00 to 23:30 today, the track works from
      // 01:00 on Saturday to 23:00 on Sunday.
      const fault = list.messages.find(({ message }) => message.id === 'simulated-2')!
      expect(fault.message.head).toBe('Færre S-tog mellem København H og Hellerup')
      expect(fault.fieldsKind).toBe('service-notice')
      expect(fault.modes).toEqual(['s-tog'])
      expect(fault.from).toBe(Date.UTC(2026, 5, 16, 3, 0))
      expect(fault.to).toBe(Date.UTC(2026, 5, 16, 21, 30))
      expect(disruptionPhase(fault, MOMENT)).toBe('active')
      const weekend = list.messages.find(({ message }) => message.id === 'simulated-3')!
      expect(weekend.fieldsKind).toBe('service-notice')
      expect(weekend.from).toBe(Date.UTC(2026, 5, 19, 23, 0))
      expect(weekend.to).toBe(Date.UTC(2026, 5, 21, 21, 0))
      expect(disruptionKind(weekend, MOMENT)).toBe('planned-works')
      expect(disruptionPhase(weekend, MOMENT)).toBe('later')
      expect(s.disruptions).toEqual({
        fetched: MOMENT,
        checked: MOMENT,
        ok: true,
        count: list.messages.length,
        version: list.version,
      })
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('keeps only Copenhagen’s messages, and counts every one received', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const list = yield* (yield* Tracker).getDisruptions
      expect(list.messages.map(({ message }) => message.id)).toEqual(['in-set', 'no-stops-bus'])
      expect(list.received).toBe(4)
      expect((yield* snapshot).disruptions?.count).toBe(2)
    }).pipe(
      Effect.provide(
        tracker(
          himsearchAnswering((request) =>
            Http.json(request, 200, {
              serverVersion: '2.0',
              dialectVersion: '2.0',
              planRtTs: '2026-06-16T07:20:00+02:00',
              Message: [
                // København H is in the fixture's stop set; Aarhus H is not.
                message('in-set', { affectedStops: { StopLocation: [stop('8600626')] } }),
                message('outside', { affectedStops: { StopLocation: [stop('8600053')] } }),
                message('no-stops-bus', { products: 32 }),
                message('no-stops-other', { products: 1 << 12 }),
              ],
            }),
          ),
        ),
      ),
    ),
  )

  it.effect('keeps the same version for the same answer after a message starts', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const before = yield* (yield* Tracker).getDisruptions
      // Past the message's 07:30 start, and past the next fetch.
      yield* watch(16, 60)
      const after = yield* (yield* Tracker).getDisruptions
      expect(after.checked).toBeGreaterThan(before.checked!)
      expect(after.version).toBe(before.version)
      expect(after.messages).toEqual(before.messages)
    }).pipe(
      Effect.provide(
        tracker(
          himsearchAnswering((request) =>
            Http.json(request, 200, {
              serverVersion: '2.0',
              dialectVersion: '2.0',
              Message: [
                message('starts-soon', {
                  affectedStops: { StopLocation: [stop('8600626')] },
                  sDate: '2026-06-16',
                  sTime: '07:30:00',
                  eDate: '2026-06-16',
                  eTime: '09:00:00',
                }),
              ],
            }),
          ),
        ),
      ),
    ),
  )

  it.effect('serves an empty list before the first fetch, with no check failed', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      yield* (yield* Store).set(callsKey(prefix, '2026-06'), SPENT_AT)
      const s = yield* snapshot
      const list = yield* (yield* Tracker).getDisruptions
      expect(list).toMatchObject({ fetched: null, checked: null, ok: true, messages: [] })
      expect(list.nextDue).toBe(s.nextDue)
    }).pipe(Effect.provide(tracker())),
  )

  it.effect('spends the month when himsearch answers with the quota error', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      expect((yield* snapshot).budget.level).not.toBe('spent')
      yield* TestClock.adjust('60 seconds')
      const after = yield* snapshot
      expect(after.budget.level).toBe('spent')
      expect(after.disruptions?.ok).toBe(false)
    }).pipe(
      Effect.provide(
        tracker(himsearchAnswering((request) => error(request, 403, 'API_QUOTA', 'spent'))),
      ),
    ),
  )

  it.effect('keeps the previous list when a fetch fails, and marks the check failed', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MOMENT)
      const first = yield* (yield* Tracker).getDisruptions
      yield* watch(15, 60)
      const s = yield* snapshot
      const failed = yield* (yield* Tracker).getDisruptions
      expect(s.disruptions).toEqual({
        fetched: MOMENT,
        checked: MOMENT + 15 * 60_000,
        ok: false,
        count: first.messages.length,
        version: first.version,
      })
      expect(failed.messages).toEqual(first.messages)
      expect(failed.ok).toBe(false)
      expect(failed.nextDue).toBe(MOMENT + 30 * 60_000)
    }).pipe(Effect.provide(tracker(himsearchFailing(2)))),
  )
})
