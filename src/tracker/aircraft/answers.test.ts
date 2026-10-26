import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { ReadsbAnswer } from './answers'

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'))

/** The weekday recording's adsb.lol answers, as they were recorded on 26 October 2026. */
const RECORDED = join(process.cwd(), 'recordings', 'weekday', 'aircraft')

const decode = Schema.decodeUnknownSync(ReadsbAnswer)

describe("the readsb answer's schema", () => {
  it('decodes the contract fixture, a real adsb.lol answer, each aircraft with the fields it carries', () => {
    const answer = decode(fixture('point'))
    expect(answer.ac).toHaveLength(18)
    const [airliner, ground] = answer.ac
    expect(airliner).toMatchObject({
      hex: '4cc594',
      type: 'adsb_icao',
      flight: 'ICE216  ',
      t: 'A320',
      alt_baro: 10300,
      gs: 320.9,
      track: 96.26,
      category: 'A3',
      lat: 55.738065,
      lon: 12.066507,
      seen_pos: 0.243,
    })
    // A transponder on the apron: no callsign, speed or track, and on the ground.
    expect(ground).toMatchObject({ hex: '45fe49', type: 'adsb_icao_nt', alt_baro: 'ground' })
    expect(ground.flight).toBeUndefined()
    expect(ground.track).toBeUndefined()
    // Placed by multilateration, with readsb's placeholder for a callsign it hasn't heard.
    expect(answer.ac.find((each) => each.type === 'mlat')).toMatchObject({
      hex: '511196',
      flight: '@@@@@@@@',
    })
  })

  it('decodes every answer recorded from adsb.lol', () => {
    const files = readdirSync(RECORDED).filter((file) => /^\d+\.json$/.test(file))
    expect(files).toHaveLength(18)
    for (const file of files) {
      const answer = decode(JSON.parse(readFileSync(join(RECORDED, file), 'utf8')))
      expect(answer.ac.length).toBeGreaterThan(0)
    }
  })

  it('refuses an answer with no aircraft list', () => {
    expect(() => decode({ now: 1, msg: 'No error' })).toThrow('Missing key')
  })
})
