import { readFileSync } from 'node:fs'
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { ReadsbAnswer } from './answers'

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'))

describe("the readsb answer's schema", () => {
  it('decodes the contract fixture, each aircraft with the fields it carries', () => {
    const answer = Schema.decodeUnknownSync(ReadsbAnswer)(fixture('point'))
    expect(answer.ac.map((aircraft) => aircraft.hex)).toEqual([
      '45ac2d',
      '4ca7b5',
      '~2d01f3',
      '45ab45',
      '4b1814',
      '45d0c1',
      '400a6e',
      '45ac90',
    ])
    const [airborne, , , taxiing, lost, rough] = answer.ac
    expect(airborne).toMatchObject({ flight: 'SAS1426 ', t: 'A20N', alt_baro: 3175 })
    expect(taxiing.alt_baro).toBe('ground')
    expect(lost.lat).toBeUndefined()
    expect(lost.lastPosition).toEqual({ lat: 55.8312, lon: 12.2016, seen_pos: 74.3 })
    expect(rough).toMatchObject({ rr_lat: 55.6, rr_lon: 12.6 })
    expect(rough.lat).toBeUndefined()
  })

  it('refuses an answer with no aircraft list', () => {
    expect(() => Schema.decodeUnknownSync(ReadsbAnswer)({ now: 1, msg: 'No error' })).toThrow(
      'Missing key',
    )
  })
})
