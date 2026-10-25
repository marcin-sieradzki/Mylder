import { describe, expect, it } from 'vitest'
import { dataState, liveLimit, type DataStateContext, type TripRealtime } from './data-state'

const now = Date.UTC(2026, 9, 26, 7, 30)
const s = (seconds: number) => now - seconds * 1000
const min = (minutes: number) => s(minutes * 60)

/** A snapshot fetched just now, from a good answer, at 60 s polls. */
const fresh: DataStateContext = {
  now,
  fetched: now,
  pollInterval: 60,
  positionMode: 'REPORT_ONLY',
  health: { status: 'ok', since: min(60) },
}

const never: TripRealtime = { hadRealtime: false }

describe('dataState', () => {
  it.each<[string, TripRealtime, Partial<DataStateContext>, string]>([
    [
      'reported 20 s ago on a 60 s interval',
      { reported: s(20), seen: s(20), hadRealtime: true },
      {},
      'live',
    ],
    [
      'reported 140 s ago on a 60 s interval',
      { reported: s(140), seen: s(140), hadRealtime: true },
      {},
      'live',
    ],
    [
      'reported 160 s ago on a 60 s interval',
      { reported: s(160), seen: s(160), hadRealtime: true },
      {},
      'ageing',
    ],
    [
      'reported 160 s ago on a 90 s interval',
      { reported: s(160), seen: s(160), hadRealtime: true },
      { pollInterval: 90 },
      'live',
    ],
    [
      'reported 230 s ago on a 90 s interval',
      { reported: s(230), seen: s(230), hadRealtime: true },
      { pollInterval: 90 },
      'ageing',
    ],
    [
      'reported 4 min 50 s ago',
      { reported: s(290), seen: s(290), hadRealtime: true },
      {},
      'ageing',
    ],
    [
      'reported 5 min ago and seen nowhere since',
      { reported: min(5), seen: min(5), hadRealtime: true },
      {},
      'no-signal',
    ],
    [
      'computed just now',
      { seen: now, hadRealtime: true },
      { positionMode: 'CALC_REPORT' },
      'estimated',
    ],
    [
      'computed 4 min ago',
      { seen: min(4), hadRealtime: true },
      { positionMode: 'CALC_REPORT' },
      'estimated',
    ],
    [
      'reported 4 min 30 s ago and computed just now',
      { reported: s(270), seen: now, hadRealtime: true },
      { positionMode: 'alternating' },
      'ageing',
    ],
    [
      'reported 6 min ago and computed just now',
      { reported: min(6), seen: now, hadRealtime: true },
      { positionMode: 'alternating' },
      'estimated',
    ],
    [
      'absent for 3 min after a report',
      { reported: min(3), seen: min(3), hadRealtime: true },
      {},
      'ageing',
    ],
    [
      'absent for 6 min after a report',
      { reported: min(6), seen: min(6), hadRealtime: true },
      {},
      'no-signal',
    ],
    [
      'absent for 6 min after a computed position',
      { seen: min(6), hadRealtime: true },
      { positionMode: 'CALC_REPORT' },
      'no-signal',
    ],
    ['with no realtime today', never, {}, 'timetable-only'],
    [
      'with no realtime today, in an outage',
      never,
      { health: { status: 'error', since: min(20) }, fetched: min(20) },
      'timetable-only',
    ],
    [
      'updated by an opened stop and never in a position answer',
      { updated: min(2), hadRealtime: true },
      {},
      'estimated',
    ],
    [
      'updated 20 min ago by an opened stop, after its last position',
      { seen: min(30), updated: min(20), hadRealtime: true },
      {},
      'estimated',
    ],
    [
      'updated before its last position, which is 6 min old',
      { seen: min(6), updated: min(8), hadRealtime: true },
      {},
      'no-signal',
    ],
  ])('a trip %s is %s', (_, trip, context, state) => {
    expect(dataState(trip, { ...fresh, ...context })).toBe(state)
  })

  it('never makes a computed position Live, however fresh', () => {
    for (const positionMode of ['CALC_REPORT', 'alternating'] as const) {
      expect(dataState({ seen: now, hadRealtime: true }, { ...fresh, positionMode })).toBe(
        'estimated',
      )
    }
  })

  describe('in an outage', () => {
    // The last good answer came 10 s before the failures began, and the trips were in it.
    const outage = (minutes: number): DataStateContext => ({
      ...fresh,
      fetched: now,
      health: { status: 'error', since: min(minutes) },
    })
    const lastAnswer = (minutes: number) => min(minutes) - 10_000
    const reportedAtLastAnswer = (minutes: number): TripRealtime => ({
      reported: lastAnswer(minutes),
      seen: lastAnswer(minutes),
      hadRealtime: true,
    })

    it.each<[string, (minutes: number) => TripRealtime]>([
      ['reported', reportedAtLastAnswer],
      ['computed', (minutes) => ({ seen: lastAnswer(minutes), hadRealtime: true })],
      [
        'updated by an opened stop',
        (minutes) => ({ updated: lastAnswer(minutes), hadRealtime: true }),
      ],
    ])('turns a %s trip No signal after five minutes of error health', (_, trip) => {
      expect(dataState(trip(5), outage(5))).toBe('no-signal')
      expect(dataState(trip(20), outage(20))).toBe('no-signal')
    })

    it.each(['error', 'empty', 'spent'] as const)('after five minutes of %s health', (status) => {
      const context = { ...fresh, health: { status, since: min(5) } }
      expect(dataState({ updated: min(6), hadRealtime: true }, context)).toBe('no-signal')
    })

    it('changes nothing in under five minutes of error health', () => {
      // The same trip at the same age, with and without the failures.
      const cases: [TripRealtime, number][] = [
        [reportedAtLastAnswer(1), 1],
        [reportedAtLastAnswer(3), 3],
        [{ seen: lastAnswer(4), hadRealtime: true }, 4],
        [{ updated: min(30), hadRealtime: true }, 4],
        [never, 4],
      ]
      for (const [trip, minutes] of cases) {
        const healthy = { ...fresh, fetched: lastAnswer(minutes) }
        expect(dataState(trip, outage(minutes))).toBe(dataState(trip, healthy))
        expect(dataState(trip, outage(minutes))).not.toBe('no-signal')
      }
    })

    it('restores every state with the first good answer', () => {
      const trip = { reported: now, seen: now, hadRealtime: true }
      expect(dataState(trip, { ...fresh, health: { status: 'ok', since: now } })).toBe('live')
    })
  })

  it('ages a browser’s snapshot by the clock when its polls stop', () => {
    const snapshot = { ...fresh, fetched: min(8) }
    expect(dataState({ reported: min(8), seen: min(8), hadRealtime: true }, snapshot)).toBe(
      'no-signal',
    )
    expect(dataState({ updated: min(9), hadRealtime: true }, snapshot)).toBe('no-signal')
    expect(dataState(never, snapshot)).toBe('timetable-only')
  })

  it('gives a Metro trip, which has no realtime, Timetable only, and a Metro trip in a report answer ordinary states', () => {
    expect(dataState(never, fresh)).toBe('timetable-only')
    expect(dataState({ reported: s(30), seen: s(30), hadRealtime: true }, fresh)).toBe('live')
  })
})

describe('liveLimit', () => {
  it.each<[number, DataStateContext['positionMode'], number]>([
    [60, 'REPORT_ONLY', 150],
    [90, 'REPORT_ONLY', 225],
    [120, 'REPORT_ONLY', 240],
    [60, 'alternating', 240],
    [60, 'CALC_REPORT', 150],
  ])('at %i s polls in %s is %i s', (pollInterval, positionMode, seconds) => {
    expect(liveLimit(pollInterval, positionMode)).toBe(seconds * 1000)
  })

  it('follows a 120 s interval when modes alternate', () => {
    const alternating = { ...fresh, positionMode: 'alternating' as const }
    const trip = (seconds: number) => ({
      reported: s(seconds),
      seen: s(seconds),
      hadRealtime: true,
    })
    expect(dataState(trip(200), alternating)).toBe('live')
    expect(dataState(trip(200), fresh)).toBe('ageing')
    expect(dataState(trip(245), alternating)).toBe('ageing')
  })
})
