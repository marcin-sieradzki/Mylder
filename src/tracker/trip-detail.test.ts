import { describe, expect, it } from 'vitest'
import { clockTime } from '../timetable/time'
import type { SnapshotDelays } from './answers'
import type { JourneyDetailAnswer, Message, Stop } from './rejseplanen/answers'
import { tripFromDetail } from './trip-detail'
import { fixtureTimetable } from './testing'

// A trip's answer from its detail, made by hand where the simulation shows no such case. 07:20:30
// in Copenhagen on Tuesday 2026-06-16, when the fixture has trips underway.
const MOMENT = Date.UTC(2026, 5, 16, 5, 20, 30)
const ZONE = 'Europe/Copenhagen'

const timetable = await fixtureTimetable()
const [today] = timetable.serviceDaysAt(MOMENT).slice(-1)
const { platforms } = timetable.stops

/** A bus underway with five calls or more. */
const trip = timetable
  .tripsOn(today)
  .find(
    (each) =>
      each.line.mode === 'bus' &&
      each.calls.length >= 5 &&
      each.calls[0].departure < MOMENT &&
      each.calls.at(-1)!.arrival > MOMENT + 10 * 60_000,
  )!

const time = (moment: number) => clockTime(moment, ZONE, { seconds: true })

/** A trip's calls as the detail's stops, on time; the bus's unless another is named. */
const stops = (planned = trip): Stop[] =>
  planned.calls.map((call, i) => {
    const { name, id, lat, lon } = platforms[call.platform]
    return {
      name,
      extId: id,
      lat,
      lon,
      routeIdx: i,
      ...(i > 0 && { arrTime: time(call.arrival), arrDate: today, arrPrognosisType: 'PROGNOSED' }),
      ...(i < planned.calls.length - 1 && {
        depTime: time(call.departure),
        depDate: today,
        depPrognosisType: 'PROGNOSED',
      }),
    }
  })

const snapshot: SnapshotDelays = { fetched: MOMENT, nextDue: MOMENT + 60_000, trips: [] }

const fromDetail = (answer: JourneyDetailAnswer) =>
  tripFromDetail(timetable, snapshot, trip, { answer, at: MOMENT }, MOMENT)

const location = (i: number) => {
  const { name, id, lat, lon } = platforms[trip.calls[i].platform]
  return { name, extId: id, lat, lon }
}

const message = (change: Partial<Message>): Message => ({
  id: 'roadworks',
  head: 'Omkørsel',
  ...change,
})

describe('a trip’s answer from its detail', () => {
  it('marks a cancelled trip, keeping its calls with no times expected', () => {
    const answer = fromDetail({ Stops: { Stop: stops() }, cancelled: true })!
    expect(answer.cancelled).toBe(true)
    expect(answer.calls).toHaveLength(trip.calls.length)
    expect(answer.calls.some((call) => call.expectedDeparture !== undefined)).toBe(false)
    expect(answer.nextCallDelay).toBeUndefined()
  })

  it('reads a message’s stretch from the stops it starts and ends at', () => {
    const answer = fromDetail({
      Stops: { Stop: stops() },
      Messages: {
        Message: [message({ validFromStop: location(1), validToStop: location(3) })],
      },
    })!
    expect(answer.messages).toMatchObject([
      { message: { id: 'roadworks' }, calls: { first: 1, last: 3 } },
    ])
  })

  it('reads a message’s stretch from the stops it affects, and gives none for no stop of the trip', () => {
    const elsewhere = { name: 'Elsewhere', extId: 'none', lat: 0, lon: 0 }
    const answer = fromDetail({
      Stops: { Stop: stops() },
      Messages: {
        Message: [
          message({ affectedStops: { StopLocation: [location(4), location(2)] } }),
          message({ id: 'elsewhere', affectedStops: { StopLocation: [elsewhere] } }),
        ],
      },
    })!
    expect(answer.messages?.map((each) => each.calls)).toEqual([{ first: 2, last: 4 }, undefined])
  })

  it('keeps a stop that cancels only its departure as a call, as a trip ending early does', () => {
    const detail = stops()
    detail[2] = { ...detail[2], cancelledDeparture: true }
    for (let i = 3; i < detail.length; i++) {
      detail[i] = { ...detail[i], cancelledArrival: true, cancelledDeparture: true }
    }
    const answer = fromDetail({ Stops: { Stop: detail } })!
    expect(answer.calls.map((call) => call.cancelled === true)).toEqual(
      trip.calls.map((_, i) => i >= 3),
    )
  })

  it('has no answer from a detail whose calls fit no trip', () => {
    const detail = stops().map((stop) => ({ ...stop, depTime: '03:03:03', arrTime: '03:03:03' }))
    expect(fromDetail({ Stops: { Stop: detail } })).toBeUndefined()
  })

  it('lifts the interval rule for a Metro trip whose detail has realtime, as a board row does', () => {
    const metro = timetable
      .tripsOn(today)
      .find((each) => each.line.mode === 'metro' && each.calls.at(-1)!.arrival > MOMENT)!
    // Its planned times alone, or each departure with a prognosis.
    const detail = (realtime: boolean) =>
      stops(metro).map(({ arrPrognosisType: _a, depPrognosisType: _d, ...stop }) =>
        realtime && stop.depTime ? { ...stop, rtDepTime: stop.depTime, rtDepDate: today } : stop,
      )
    const answerOf = (realtime: boolean) =>
      tripFromDetail(
        timetable,
        snapshot,
        metro,
        { answer: { Stops: { Stop: detail(realtime) } }, at: MOMENT },
        MOMENT,
      )!
    expect(answerOf(false).runsToInterval).toBe(true)
    const live = answerOf(true)
    expect(live.runsToInterval).toBeUndefined()
    expect(live.interval).toBeUndefined()
  })
})
