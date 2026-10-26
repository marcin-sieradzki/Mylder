import { describe, expect, it } from 'vitest'
import { stopDeparturesFrom, tripDetailFrom, type SnapshotDelays } from './answers'
import type { SnapshotTrip } from './snapshot'
import { fixtureTimetable } from './testing'

// 07:20 in Copenhagen on Tuesday 2026-06-16, when the fixture has trips underway.
const MOMENT = Date.UTC(2026, 5, 16, 5, 20, 30)

const timetable = await fixtureTimetable()
const [today] = timetable.serviceDaysAt(MOMENT).slice(-1)

/** A call a stop's board lists: not the trip's first or last, leaving five to twenty minutes on. */
function callsAhead(calls: number, i: number, departure: number) {
  return (
    i > 0 && i < calls - 1 && departure > MOMENT + 5 * 60_000 && departure < MOMENT + 20 * 60_000
  )
}

// A trip with a call still ahead at the moment, and the stop of that call.
const late = timetable
  .tripsOn(today)
  .find((trip) => trip.calls.some((call, i) => callsAhead(trip.calls.length, i, call.departure)))!
const ahead = late.calls.findIndex((call, i) => callsAhead(late.calls.length, i, call.departure))
const platform = timetable.stops.platforms[late.calls[ahead].platform]
const stop = timetable.stops.stops[platform.stop]

/** A snapshot at the moment with only `late` on the map, two minutes late. */
const snapshot = (trips: readonly Partial<SnapshotTrip>[]): SnapshotDelays => ({
  fetched: MOMENT,
  nextDue: MOMENT + 60_000,
  trips: trips as SnapshotTrip[],
})
const delayed = snapshot([{ key: late.key, delay: 120, state: 'estimated' }])

describe('a trip’s calls', () => {
  it('shifts each call by the snapshot’s delay', () => {
    const detail = tripDetailFrom(timetable, delayed, late.key, MOMENT)!
    expect(detail).toMatchObject({ key: late.key, delay: 120, state: 'estimated' })
    const call = detail.calls[ahead]
    expect(call).toMatchObject({ stop: platform.id, name: platform.name })
    expect(call.expectedDeparture! - call.departure).toBe(120_000)
  })

  it('keeps the timetable’s times for a trip the snapshot has no delay for', () => {
    const detail = tripDetailFrom(timetable, snapshot([]), late.key, MOMENT)!
    expect(detail.state).toBe('timetable-only')
    expect(detail.delay).toBeUndefined()
    expect(detail.calls[ahead].expectedDeparture).toBeUndefined()
  })

  it('has no answer for a trip not running today', () => {
    expect(tripDetailFrom(timetable, delayed, 'bus.5C.nothing.20260616.0700', MOMENT)).toBe(
      undefined,
    )
  })
})

describe('a stop’s departures', () => {
  it('lists the trip at its delayed time, soonest first', () => {
    const board = stopDeparturesFrom(timetable, delayed, stop.id)!
    expect(board.stop).toEqual({ id: stop.id, name: stop.name })
    const row = board.departures.find((each) => each.trip === late.key)
    expect(row).toMatchObject({
      platform: platform.id,
      scheduled: late.calls[ahead].departure,
      expected: late.calls[ahead].departure + 120_000,
      state: 'estimated',
    })
    const times = board.departures.map((each) => each.expected ?? each.scheduled)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(
      board.departures.every((each) => each.expected === undefined || each.trip === late.key),
    ).toBe(true)
  })

  it('finds a stop by a platform’s id', () => {
    expect(stopDeparturesFrom(timetable, delayed, platform.id)?.stop.id).toBe(stop.id)
  })

  it('has no answer for a stop the timetable doesn’t know', () => {
    expect(stopDeparturesFrom(timetable, delayed, 'no such stop')).toBeUndefined()
  })
})
