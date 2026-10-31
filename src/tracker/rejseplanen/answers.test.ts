import { readFileSync } from 'node:fs'
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  ArrivalBoardAnswer,
  DepartureBoardAnswer,
  ErrorAnswer,
  HimSearchAnswer,
  JourneyDetailAnswer,
  JourneyPosAnswer,
  QUOTA_SPENT,
  REFUSED_KEY,
} from './answers'

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'))

const decode = <S extends Schema.Codec<unknown, unknown>>(schema: S, name: string) =>
  Schema.decodeUnknownSync(schema)(fixture(name))

describe('the answer schemas', () => {
  it.each<[string, Schema.Codec<unknown, unknown>]>([
    ['journey-pos', JourneyPosAnswer],
    ['journey-pos-empty', JourneyPosAnswer],
    ['departure-board', DepartureBoardAnswer],
    ['arrival-board', ArrivalBoardAnswer],
    ['journey-detail', JourneyDetailAnswer],
    ['him-search', HimSearchAnswer],
    ['error-refused-key', ErrorAnswer],
    ['error-quota', ErrorAnswer],
  ])('decode the %s fixture', (name, schema) => {
    expect(() => decode(schema, name)).not.toThrow()
  })

  it('decode journeyPos journeys with and without their stops and path', () => {
    const [withStops, bare] = decode(JourneyPosAnswer, 'journey-pos').Journey ?? []
    expect(withStops.Stops?.Stop.map((stop) => stop.extId)).toEqual(['8600626', '8600645'])
    expect(withStops.JourneyPath?.[0].progressInPercent).toBe(12)
    expect(bare.Stops).toBeUndefined()
    expect(bare.JourneyPath).toBeUndefined()
  })

  it('read an answer with no journeys as one without the list', () => {
    expect(decode(JourneyPosAnswer, 'journey-pos-empty').Journey).toBeUndefined()
  })

  it('decode a note that holds notes', () => {
    const [message] = decode(HimSearchAnswer, 'him-search').Message ?? []
    expect(message.Note?.[0].Note?.[0].value).toBe('Via Knippelsbro')
  })

  it('keep a cancelled departure and a Metro departure without a prognosis', () => {
    const [late, cancelled, metro] = decode(DepartureBoardAnswer, 'departure-board').Departure ?? []
    expect(late).toMatchObject({ rtTime: '10:33:00', prognosisType: 'PROGNOSED' })
    expect(cancelled).toMatchObject({ cancelled: true, reachable: false })
    expect(cancelled.prognosisType).toBeUndefined()
    expect(metro.ProductAtStop?.cls).toBe('1024')
    expect(metro.prognosisType).toBeUndefined()
  })

  it('keep where an arrival comes from, a cancelled arrival, and a Metro arrival without a prognosis', () => {
    const [late, cancelled, metro] = decode(ArrivalBoardAnswer, 'arrival-board').Arrival ?? []
    expect(late).toMatchObject({
      origin: 'Hillerød St.',
      time: '10:31:00',
      rtTime: '10:32:00',
      rtTrack: '10',
      prognosisType: 'PROGNOSED',
    })
    expect(cancelled).toMatchObject({ origin: 'Køge St.', cancelled: true, reachable: false })
    expect(cancelled.prognosisType).toBeUndefined()
    expect(metro.ProductAtStop?.cls).toBe('1024')
    expect(metro.prognosisType).toBeUndefined()
  })

  it('give a trip detail its cancelled call, last position and message range', () => {
    const detail = decode(JourneyDetailAnswer, 'journey-detail')
    expect(detail.Stops.Stop[1]).toMatchObject({ cancelledArrival: true, cancelledDeparture: true })
    expect(detail.lastPos).toEqual({ lat: 55.679, lon: 12.566 })
    expect(detail.Messages?.Message[0]).toMatchObject({ routeIdxFrom: 14, routeIdxTo: 14 })
  })

  it('name the error codes the fixtures carry', () => {
    expect(decode(ErrorAnswer, 'error-refused-key').errorCode).toBe(REFUSED_KEY)
    expect(decode(ErrorAnswer, 'error-quota').errorCode).toBe(QUOTA_SPENT)
  })

  it.each<[string, Schema.Codec<unknown, unknown>, (answer: any) => void, RegExp]>([
    ['journey-pos', JourneyPosAnswer, (a) => delete a.Journey[0].lat, /lat/],
    ['departure-board', DepartureBoardAnswer, (a) => delete a.Departure[0].time, /time/],
    ['arrival-board', ArrivalBoardAnswer, (a) => delete a.Arrival[0].stopExtId, /stopExtId/],
    ['journey-detail', JourneyDetailAnswer, (a) => delete a.Stops, /Stops/],
    ['him-search', HimSearchAnswer, (a) => delete a.Message[1].head, /head/],
    ['error-refused-key', ErrorAnswer, (a) => delete a.errorCode, /errorCode/],
  ])(
    'reject the %s fixture with a required field removed, naming it',
    (name, schema, remove, field) => {
      const answer = fixture(name)
      remove(answer)
      expect(() => Schema.decodeUnknownSync(schema)(answer)).toThrow(field)
    },
  )

  it('give back the same answer when encoding what they decoded', () => {
    const answer = decode(JourneyPosAnswer, 'journey-pos')
    expect(Schema.encodeSync(JourneyPosAnswer)(answer)).toEqual(fixture('journey-pos'))
  })
})
