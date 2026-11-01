import { describe, expect, it } from 'vitest'
import {
  dataState,
  feedFresh,
  liveLimit,
  noSignalSince,
  updatesContext,
  type DataStateContext,
  type TripRealtime,
} from './data-state'

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

describe('dataState with SIRI-ET’s update feed on', () => {
  // The feed is fresh while its table is present and its last message is under 5 min old; a trip's
  // own update may be older, since SIRI-ET sends one only when something changes.
  const feed = (lastMessage?: number): DataStateContext => ({
    ...fresh,
    positionMode: 'none',
    updates: lastMessage === undefined ? {} : { lastMessage },
  })

  it.each<[string, TripRealtime, DataStateContext, string]>([
    [
      'updated 20 min ago, with the feed’s last message 30 s ago',
      { updated: min(20), hadRealtime: true },
      feed(s(30)),
      'estimated',
    ],
    [
      'updated 2 min ago, with the feed’s last message 4 min 59 s ago',
      { updated: min(2), hadRealtime: true },
      feed(s(299)),
      'estimated',
    ],
    [
      'updated 2 min ago, with the feed’s last message 5 min ago',
      { updated: min(2), hadRealtime: true },
      feed(min(5)),
      'no-signal',
    ],
    [
      'updated earlier today, with the table gone from the store',
      { updated: min(20), hadRealtime: true },
      feed(),
      'no-signal',
    ],
    ['with no update today, with the feed fresh', never, feed(s(30)), 'timetable-only'],
    ['with no update today, with the table gone', never, feed(), 'timetable-only'],
  ])('a trip %s', (_, trip, context, state) => {
    expect(dataState(trip, context)).toBe(state)
  })

  it('ages the feed by the clock in a browser whose snapshot is 2 min old', () => {
    const context = { ...feed(min(4)), fetched: min(2) }
    expect(dataState({ updated: min(10), hadRealtime: true }, context)).toBe('estimated')
    expect(
      dataState({ updated: min(10), hadRealtime: true }, { ...context, now: now + 60_000 }),
    ).toBe('no-signal')
  })
})

describe('a quiet SIRI-ET feed', () => {
  // The feed goes quiet when no message has come for 5 min: every trip that had an update turns
  // No signal from the last message's time, and a trip without one stays Timetable only.
  const lastMessage = min(5)
  const quiet: DataStateContext = { ...fresh, positionMode: 'none', updates: { lastMessage } }
  const updated: TripRealtime = { updated: min(20), hadRealtime: true }

  it.each<[string, number, string, string]>([
    ['a trip with an update, 1 ms before', 4 * 60_000 + 59_999, 'updated', 'estimated'],
    ['a trip with an update, at 5 min', 5 * 60_000, 'updated', 'no-signal'],
    ['a trip with an update, at 30 min', 30 * 60_000, 'updated', 'no-signal'],
    ['a trip without one, at 5 min', 5 * 60_000, 'never', 'timetable-only'],
  ])('makes %s after the last message', (_, after, which, state) => {
    const trip = which === 'updated' ? updated : never
    expect(dataState(trip, { ...quiet, now: lastMessage + after })).toBe(state)
  })

  it('dates a No signal trip from the feed’s last message, not its own older update', () => {
    expect(noSignalSince(updated, quiet.updates)).toBe(lastMessage)
    // With no message ever read, from its own update.
    expect(noSignalSince(updated, {})).toBe(min(20))
    // While updates are off, an opened stop's update dates it, as before.
    expect(noSignalSince(updated, undefined)).toBe(min(20))
  })

  it('dates a trip a position answer carried from that answer, whatever the feed says', () => {
    expect(noSignalSince({ seen: min(9), reported: min(12), hadRealtime: true }, {})).toBe(min(9))
    expect(noSignalSince({ reported: min(12), updated: min(2), hadRealtime: true }, {})).toBe(
      min(12),
    )
    expect(noSignalSince(never, quiet.updates)).toBeUndefined()
  })
})

describe('SIRI-ET’s update feed in the context', () => {
  it('leaves the context alone while updates are off, so position answers judge updates', () => {
    expect(updatesContext({ kind: 'off' })).toEqual({})
    expect(updatesContext({ kind: 'off', lastMessage: min(1) })).toEqual({})
  })

  it('gives the table’s last message while updates are on, and none with no table', () => {
    expect(updatesContext({ kind: 'siri', lastMessage: min(1) })).toEqual({
      updates: { lastMessage: min(1) },
    })
    expect(updatesContext({ kind: 'recording' })).toEqual({ updates: {} })
  })

  it('calls the feed fresh while its last message is under 5 min old', () => {
    expect(feedFresh(s(299), now)).toBe(true)
    expect(feedFresh(min(5), now)).toBe(false)
    expect(feedFresh(undefined, now)).toBe(false)
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
