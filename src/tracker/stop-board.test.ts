import { describe, expect, it } from 'vitest'
import { clockTime } from '../timetable/time'
import type { SnapshotDelays } from './answers'
import type { Departure } from './rejseplanen/answers'
import type { SnapshotTrip } from './snapshot'
import { departuresFromBoard } from './stop-board'
import { fixtureTimetable } from './testing'

// A stop's departures from its board answer, made by hand where the simulation shows no such
// case. 07:20:30 in Copenhagen on Tuesday 2026-06-16, when the fixture has trips underway.
const MOMENT = Date.UTC(2026, 5, 16, 5, 20, 30)
const ZONE = 'Europe/Copenhagen'

const timetable = await fixtureTimetable()
const [today] = timetable.serviceDaysAt(MOMENT).slice(-1)

/** A call a stop's board lists: not the trip's first or last, leaving five to twenty minutes on. */
const ahead = (calls: number, i: number, departure: number) =>
  i > 0 && i < calls - 1 && departure > MOMENT + 5 * 60_000 && departure < MOMENT + 20 * 60_000

const trip = timetable
  .tripsOn(today)
  .find(
    (each) =>
      each.line.mode !== 'metro' &&
      each.calls.some((call, i) => ahead(each.calls.length, i, call.departure)),
  )!
const index = trip.calls.findIndex((call, i) => ahead(trip.calls.length, i, call.departure))
const platform = timetable.stops.platforms[trip.calls[index].platform]
const stop = timetable.stops.stops[platform.stop]
const planned = trip.calls[index].departure

/** The trip's departure on the board, two minutes late, with no reference the join can read. */
const departure = (change: Partial<Departure> = {}): Departure => ({
  JourneyDetailRef: { ref: 'unreadable' },
  name: trip.line.name,
  stop: platform.name,
  stopExtId: platform.id,
  date: today,
  time: clockTime(planned, ZONE, { seconds: true }),
  rtDate: today,
  rtTime: clockTime(planned + 120_000, ZONE, { seconds: true }),
  prognosisType: 'PROGNOSED',
  direction: trip.headsign,
  ProductAtStop: { line: trip.line.name },
  ...change,
})

const at = (trips: readonly Partial<SnapshotTrip>[] = []): SnapshotDelays => ({
  fetched: MOMENT,
  nextDue: MOMENT + 60_000,
  trips: trips as SnapshotTrip[],
})

const fromBoard = (departures: readonly Departure[], snapshot = at()) =>
  departuresFromBoard(
    timetable,
    snapshot,
    stop.id,
    { answer: { Departure: departures }, at: MOMENT },
    MOMENT,
  )!.departures

describe('a stop’s departures from its board', () => {
  it('gives a row with the board’s realtime Estimated where the map has its trip as No signal', () => {
    const rows = fromBoard(
      [departure()],
      at([{ key: trip.key, state: 'no-signal', hadRealtime: true }]),
    )
    expect(rows).toMatchObject([
      { trip: trip.key, state: 'estimated', expected: planned + 120_000 },
    ])
  })

  it('joins a departure only to a trip going its way', () => {
    expect(fromBoard([departure({ direction: 'Somewhere else' })])).toEqual([])
  })

  it('joins two departures alike in line, time and way to the trip once', () => {
    expect(fromBoard([departure(), departure()]).map((row) => row.trip)).toEqual([trip.key])
  })
})
