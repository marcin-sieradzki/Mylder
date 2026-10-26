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
