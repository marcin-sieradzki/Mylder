import { describe, expect, it } from 'vitest'
import { aircraftState, type AircraftPosition, type AircraftStateContext } from './aircraft-state'

const fetched = Date.UTC(2026, 9, 26, 7, 30)
const s = (seconds: number) => fetched + seconds * 1000

/** A snapshot fetched from a good answer, decided at its own moment, at 10 s polls. */
const fresh: AircraftStateContext = {
  now: fetched,
  fetched,
  pollInterval: 10,
  health: { status: 'ok', since: s(-3600) },
}

describe('aircraftState', () => {
  it.each<[string, AircraftPosition, Partial<AircraftStateContext>, string | undefined]>([
    [
      'a broadcast position 12 s old on a 10 s interval',
      { age: 12, source: 'broadcast' },
      {},
      'live',
    ],
    ['a broadcast position 25 s old', { age: 25, source: 'broadcast' }, {}, 'ageing'],
    ['a multilateration position 2 s old', { age: 2, source: 'multilateration' }, {}, 'estimated'],
    ['a broadcast position 70 s old', { age: 70, source: 'broadcast' }, {}, 'no-signal'],
    ['a position 6 min old', { age: 360, source: 'broadcast' }, {}, undefined],
  ])('%s is %s', (_, position, context, state) => {
    expect(aircraftState(position, { ...fresh, ...context })).toBe(state)
  })

  it.each<[string, AircraftPosition, string]>([
    ['a broadcast position 19.9 s old', { age: 19.9, source: 'broadcast' }, 'live'],
    ['a broadcast position 20 s old', { age: 20, source: 'broadcast' }, 'ageing'],
    ['a broadcast position 59.9 s old', { age: 59.9, source: 'broadcast' }, 'ageing'],
    ['a broadcast position 60 s old', { age: 60, source: 'broadcast' }, 'no-signal'],
    ['a TIS-B position 1 s old', { age: 1, source: 'tisb' }, 'estimated'],
    ['a position of another kind 1 s old', { age: 1, source: 'other' }, 'estimated'],
    [
      'a multilateration position 59.9 s old',
      { age: 59.9, source: 'multilateration' },
      'estimated',
    ],
    ['a multilateration position 60 s old', { age: 60, source: 'multilateration' }, 'no-signal'],
    ['a position 4 min 59 s old', { age: 299, source: 'multilateration' }, 'no-signal'],
  ])('%s is %s', (_, position, state) => {
    expect(aircraftState(position, fresh)).toBe(state)
  })

  it('never makes a position the ground worked out Live, however fresh', () => {
    for (const source of ['multilateration', 'tisb', 'other'] as const) {
      expect(aircraftState({ age: 0, source }, fresh)).toBe('estimated')
    }
  })

  it('follows the poll interval: two polls keep a broadcast position Live', () => {
    expect(aircraftState({ age: 25, source: 'broadcast' }, { ...fresh, pollInterval: 15 })).toBe(
      'live',
    )
  })

  it('ages a position by the clock from the snapshot’s fetch', () => {
    // 12 s old at fetch, so 20 s old 8 s later; 6 min old at 348 s.
    const position: AircraftPosition = { age: 12, source: 'broadcast' }
    expect(aircraftState(position, { ...fresh, now: s(7.9) })).toBe('live')
    expect(aircraftState(position, { ...fresh, now: s(8) })).toBe('ageing')
    expect(aircraftState(position, { ...fresh, now: s(48) })).toBe('no-signal')
    expect(aircraftState(position, { ...fresh, now: s(288) })).toBeUndefined()
  })

  it('makes every aircraft No signal once the feed has failed for over 60 s', () => {
    const position: AircraftPosition = { age: 0, source: 'multilateration' }
    const failing = (seconds: number): AircraftStateContext => ({
      ...fresh,
      health: { status: 'error', since: s(-seconds) },
    })
    expect(aircraftState(position, failing(60))).toBe('estimated')
    expect(aircraftState(position, failing(61))).toBe('no-signal')
    expect(aircraftState({ age: 1, source: 'broadcast' }, failing(61))).toBe('no-signal')
  })
})
