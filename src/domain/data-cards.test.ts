import { describe, expect, it } from 'vitest'
import { dataCards, type DataCardFacts } from './data-cards'

// 08:14 in Copenhagen on Monday 2026-10-26.
const NOW = Date.UTC(2026, 9, 26, 7, 14)
const MINUTE = 60_000

const healthy: DataCardFacts = {
  api: { status: 'ok', since: NOW - 60 * MINUTE },
  budget: { level: 'normal' },
  lastSeen: { bus: NOW - MINUTE, 's-tog': NOW - MINUTE },
  disruptions: { fetched: NOW - 5 * MINUTE, ok: true },
  trips: [{ mode: 'bus' }, { mode: 's-tog' }, { mode: 'metro' }],
  source: { kind: 'rejseplanen' },
}

describe('Mylder’s own data cards', () => {
  it('shows none on a healthy snapshot', () => {
    expect(dataCards(healthy, NOW)).toEqual([])
  })

  it('says live data is paused until the 1st when the month is spent, and nothing else', () => {
    const spent = {
      ...healthy,
      api: { status: 'spent' as const, since: NOW - 30 * MINUTE },
      budget: { level: 'spent' as const, resumes: '2026-11-01' },
      lastSeen: { bus: NOW - 30 * MINUTE },
    }
    expect(dataCards(spent, NOW)).toEqual([{ kind: 'paused', resumes: '2026-11-01' }])
  })

  it('says Rejseplanen hasn’t answered once it has failed or answered nothing for 5 min', () => {
    const failing = (minutes: number, status: 'error' | 'empty' = 'error') => ({
      ...healthy,
      api: { status, since: NOW - minutes * MINUTE },
      lastSeen: { bus: NOW - minutes * MINUTE },
    })
    expect(dataCards(failing(4), NOW)).toEqual([])
    // The mode cards would only repeat it, so they wait until it answers again.
    expect(dataCards(failing(5), NOW)).toEqual([{ kind: 'no-answer', since: NOW - 5 * MINUTE }])
    expect(dataCards(failing(9, 'empty'), NOW)).toEqual([
      { kind: 'no-answer', since: NOW - 9 * MINUTE },
    ])
  })

  it('times no answer from the last good answer, through a switch between failing and empty', () => {
    // It failed from 08:04, then answered empty from 08:12: the last answer that carried a trip
    // was 08:03's.
    const flipped = {
      ...healthy,
      api: { status: 'empty' as const, since: NOW - 2 * MINUTE },
      lastSeen: { bus: NOW - 11 * MINUTE, 's-tog': NOW - 12 * MINUTE },
    }
    expect(dataCards(flipped, NOW)).toEqual([{ kind: 'no-answer', since: NOW - 11 * MINUTE }])
  })

  it('names a mode with trips in service whose positions stopped 5 min ago', () => {
    const quiet = { ...healthy, lastSeen: { bus: NOW - 5 * MINUTE, 's-tog': NOW - 4 * MINUTE } }
    expect(dataCards(quiet, NOW)).toEqual([
      { kind: 'mode-quiet', mode: 'bus', since: NOW - 5 * MINUTE },
    ])
  })

  it('names no mode that no answer carried today, or that has no trip in service', () => {
    // The Metro has trips but never had a position; the S-tog stopped for the night.
    const night = {
      ...healthy,
      lastSeen: { 's-tog': NOW - 90 * MINUTE },
      trips: [{ mode: 'metro' }, { mode: 's-tog', waiting: true as const }],
    }
    expect(dataCards(night, NOW)).toEqual([])
  })

  it('says the messages are not updated when the last check failed and the list is 15 min old', () => {
    const stale = (minutes: number) => ({
      ...healthy,
      disruptions: { fetched: NOW - minutes * MINUTE, ok: false },
    })
    expect(dataCards(stale(15), NOW)).toEqual([])
    expect(dataCards(stale(16), NOW)).toEqual([
      { kind: 'messages-stale', since: NOW - 16 * MINUTE },
    ])
  })

  it('says the messages are not updated when the list is an hour old with no check failed', () => {
    // A spent month makes no calls, so the last good list stays.
    const spent = {
      ...healthy,
      api: { status: 'spent' as const, since: NOW - 3 * 60 * MINUTE },
      budget: { level: 'spent' as const, resumes: '2026-11-01' },
      disruptions: { fetched: NOW - 3 * 60 * MINUTE, ok: true },
    }
    expect(dataCards(spent, NOW)).toEqual([
      { kind: 'paused', resumes: '2026-11-01' },
      { kind: 'messages-stale', since: NOW - 3 * 60 * MINUTE },
    ])
    const hour = { ...healthy, disruptions: { fetched: NOW - 60 * MINUTE, ok: true } }
    expect(dataCards(hour, NOW)).toEqual([])
  })

  it('says the messages are not updated, with no time, when no fetch has worked', () => {
    const never = { ...healthy, disruptions: { fetched: null, ok: false } }
    expect(dataCards(never, NOW)).toEqual([{ kind: 'messages-stale' }])
  })

  it('holds the mode cards while Rejseplanen fails, before its own card shows', () => {
    const failing = {
      ...healthy,
      // The buses went quiet 7 min ago; the last good answer, 3 min ago, carried S-tog.
      api: { status: 'error' as const, since: NOW - 2 * MINUTE },
      lastSeen: { bus: NOW - 7 * MINUTE, 's-tog': NOW - 3 * MINUTE },
    }
    expect(dataCards(failing, NOW)).toEqual([])
  })

  it('puts the cards in a fixed order, at most one each and one per mode', () => {
    const everything = {
      ...healthy,
      lastSeen: { bus: NOW - 20 * MINUTE, 's-tog': NOW - 10 * MINUTE },
      disruptions: { fetched: NOW - 40 * MINUTE, ok: false },
    }
    expect(dataCards(everything, NOW).map((card) => card.kind)).toEqual([
      'mode-quiet',
      'mode-quiet',
      'messages-stale',
    ])
    expect(dataCards(everything, NOW).slice(0, 2)).toEqual([
      { kind: 'mode-quiet', mode: 's-tog', since: NOW - 10 * MINUTE },
      { kind: 'mode-quiet', mode: 'bus', since: NOW - 20 * MINUTE },
    ])
  })
})

describe('Mylder’s own data cards on the timetable source', () => {
  /**
   * A snapshot on the timetable source, as the tracker builds it (recordings/timetable-source):
   * no call made, so the API is ok, no position seen and no disruption list, with trips Waiting
   * and underway.
   */
  const built = NOW
  const onTimetable: DataCardFacts = {
    api: { status: 'ok', since: built - 5 * MINUTE },
    budget: { level: 'normal' },
    lastSeen: {},
    disruptions: null,
    trips: [{ mode: 'bus' }, { mode: 's-tog' }, { mode: 'metro' }, { mode: 'bus', waiting: true }],
    source: { kind: 'timetable' },
  }
  const HOUR = 60 * MINUTE

  // No call is made, so no gap is a fault: whatever else the snapshot says, no card shows,
  // minutes or hours after it was built.
  it.each([
    ['as built', onTimetable],
    ['with the month spent', { ...onTimetable, budget: { level: 'spent', resumes: '2026-07-01' } }],
    ['with the API failing', { ...onTimetable, api: { status: 'error', since: built - HOUR } }],
    ['with a mode gone quiet', { ...onTimetable, lastSeen: { bus: built - 3 * HOUR } }],
    ['with messages never fetched', { ...onTimetable, disruptions: { fetched: null, ok: false } }],
    ['with old messages', { ...onTimetable, disruptions: { fetched: built - 3 * HOUR, ok: true } }],
  ] satisfies [string, DataCardFacts][])('shows none %s', (_, facts) => {
    for (const later of [0, 5 * MINUTE, 3 * HOUR, 30 * HOUR]) {
      expect(dataCards(facts, built + later)).toEqual([])
    }
  })
})

describe('Mylder’s card for a quiet SIRI-ET feed', () => {
  // SIRI-ET's update feed (spec #146): quiet once its last message is 5 min old, or before one has
  // come. Shown on any source, the timetable's too, which brings no other card.
  const onTimetable: DataCardFacts = {
    api: { status: 'ok', since: NOW - 60 * MINUTE },
    budget: { level: 'normal' },
    lastSeen: {},
    disruptions: null,
    trips: [{ mode: 'bus' }, { mode: 'metro' }],
    source: { kind: 'timetable' },
  }
  const feed = (lastMessage?: number): DataCardFacts => ({
    ...onTimetable,
    updates: { kind: 'siri', ...(lastMessage === undefined ? {} : { lastMessage }) },
  })

  it.each<[string, DataCardFacts, unknown[]]>([
    ['with its last message 4 min 59 s ago', feed(NOW - 299_000), []],
    [
      'with its last message 5 min ago',
      feed(NOW - 5 * MINUTE),
      [{ kind: 'updates-stale', since: NOW - 5 * MINUTE }],
    ],
    [
      'with its last message an hour ago',
      feed(NOW - 60 * MINUTE),
      [{ kind: 'updates-stale', since: NOW - 60 * MINUTE }],
    ],
    ['before any message has come', feed(), [{ kind: 'updates-stale' }]],
    [
      'replayed from a recording that has stopped',
      { ...onTimetable, updates: { kind: 'recording', lastMessage: NOW - 6 * MINUTE } },
      [{ kind: 'updates-stale', since: NOW - 6 * MINUTE }],
    ],
    ['with updates off', { ...onTimetable, updates: { kind: 'off' } }, []],
    ['with no updates block, as an older snapshot has none', onTimetable, []],
  ])('on the timetable source %s', (_, facts, cards) => {
    expect(dataCards(facts, NOW)).toEqual(cards)
  })

  it('shows only while the feed is quiet, and goes at the next message', () => {
    const quietFrom = NOW - 5 * MINUTE
    expect(dataCards(feed(quietFrom), NOW - 1)).toEqual([])
    expect(dataCards(feed(quietFrom), NOW)).toEqual([{ kind: 'updates-stale', since: quietFrom }])
    expect(dataCards(feed(NOW - 10_000), NOW)).toEqual([])
  })

  it('comes first, before Rejseplanen’s own cards', () => {
    const everything: DataCardFacts = {
      ...healthy,
      lastSeen: { bus: NOW - 20 * MINUTE, 's-tog': NOW - 10 * MINUTE },
      disruptions: { fetched: NOW - 40 * MINUTE, ok: false },
      updates: { kind: 'siri', lastMessage: NOW - 7 * MINUTE },
    }
    expect(dataCards(everything, NOW).map((card) => card.kind)).toEqual([
      'updates-stale',
      'mode-quiet',
      'mode-quiet',
      'messages-stale',
    ])
  })
})
