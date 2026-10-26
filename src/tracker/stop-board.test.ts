import { describe, expect, it } from 'vitest'
import { clockTime } from '../timetable/time'
import type { PlannedTrip } from '../timetable/trips'
import { findStop, type SnapshotDelays } from './answers'
import type { Departure, Message } from './rejseplanen/answers'
import type { SnapshotTrip } from './snapshot'
import type { Corrections } from './join'
import { journeyRef, referenceDay } from './simulation/journeys'
import { departuresFromBoard } from './stop-board'
import { fixtureTimetable, startingAtMidnight } from './testing'

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

const answerFrom = (departures: readonly Departure[], snapshot = at()) =>
  departuresFromBoard(
    timetable,
    snapshot,
    findStop(timetable, stop.id)!,
    { answer: { Departure: departures }, at: MOMENT },
    MOMENT,
  )

const fromBoard = (departures: readonly Departure[], snapshot = at()) =>
  answerFrom(departures, snapshot).departures

/** A message a departure carries, by its id, with what it names or covers. */
const message = (id: string, fields: Partial<Message> = {}): Message => ({
  id,
  head: `Message ${id}`,
  ...fields,
})

/** A platform as a message names it. */
const named = (where: (typeof timetable.stops.platforms)[number]) => ({
  name: where.name,
  extId: where.id,
  lon: where.lon,
  lat: where.lat,
})

/** The ids of the messages a board's answer keeps for the stop. */
const messagesFrom = (departures: readonly Departure[]) =>
  answerFrom(departures).messages.map((each) => each.message.id)

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

describe('a stop’s board after the join was corrected', () => {
  /** A trip's call here, not its last, leaving in the board's window. */
  const leaving = (each: PlannedTrip) =>
    each.calls.flatMap((call, i) =>
      i < each.calls.length - 1 && call.departure > MOMENT && call.departure < MOMENT + 20 * 60_000
        ? [{ trip: each, index: i, stop: timetable.stops.platforms[call.platform].stop }]
        : [],
    )
  const calls = timetable.tripsOn(today).flatMap(leaving)
  // Two trips that leave one stop at the same time: the board's journey reads as the first, and
  // a trip's detail showed it to be the second.
  const [read, truth] = calls.flatMap((one) => {
    const other = calls.find(
      (each) =>
        each.trip !== one.trip &&
        each.stop === one.stop &&
        each.trip.calls[each.index].departure === one.trip.calls[one.index].departure,
    )
    return other ? [one, other] : []
  })
  const here = timetable.stops.platforms[read.trip.calls[read.index].platform]
  const time = clockTime(read.trip.calls[read.index].departure, ZONE, { seconds: true })
  const board = (corrections?: Corrections) =>
    departuresFromBoard(
      timetable,
      { fetched: MOMENT, nextDue: MOMENT + 60_000, trips: [] },
      findStop(timetable, here.id)!,
      {
        answer: {
          Departure: [
            departure({
              JourneyDetailRef: { ref: journeyRef(timetable, read.trip, 4711) },
              name: read.trip.line.name,
              stop: here.name,
              stopExtId: here.id,
              time,
              rtTime: time,
              direction: read.trip.headsign,
              ProductAtStop: { line: read.trip.line.name },
            }),
          ],
        },
        at: MOMENT,
      },
      MOMENT,
      corrections,
    ).departures.map((row) => row.trip)

  it('joins a corrected journey’s departure to the trip its correction names', () => {
    expect(board()).toEqual([read.trip.key])
    expect(board({ [`4711@${referenceDay(today)}`]: truth.trip.key })).toEqual([truth.trip.key])
  })
})

describe('a stop’s messages from its board', () => {
  /** A platform of another stop, one the trip calls at later. */
  const later = timetable.stops.platforms[trip.calls[trip.calls.length - 1].platform]

  it('keeps the messages that cover the departure’s call here, or the whole trip', () => {
    const carried = [
      message('here', { routeIdxFrom: index - 1, routeIdxTo: index }),
      message('further on', { routeIdxFrom: index + 1, routeIdxTo: trip.calls.length - 1 }),
      message('the whole trip'),
      message('another stop', { affectedStops: { StopLocation: [named(later)] } }),
    ]
    expect(messagesFrom([departure({ Messages: { Message: carried } })])).toEqual([
      'here',
      'the whole trip',
    ])
  })

  it('keeps a message on a departure it doesn’t list only when it names the stop', () => {
    const carried = [
      message('the whole trip'),
      message('this stop', { affectedStops: { StopLocation: [named(platform)] } }),
    ]
    const elsewhere = departure({ direction: 'Somewhere else', Messages: { Message: carried } })
    expect(messagesFrom([elsewhere])).toEqual(['this stop'])
  })
})

describe('a stop’s board just before midnight', () => {
  // 23:50 in Copenhagen on Tuesday 2026-06-16, with Wednesday's trips starting from midnight.
  const NIGHT = Date.UTC(2026, 5, 16, 21, 50)
  const night = startingAtMidnight(timetable, '2026-06-17')
  const tomorrow = night
    .tripsOn('2026-06-17')
    .find((each) => each.line.mode !== 'metro' && each.calls[0].departure < NIGHT + 20 * 60_000)!
  const first = night.stops.platforms[tomorrow.calls[0].platform]

  it('joins a departure to a trip of the next service day', () => {
    const leaving = tomorrow.calls[0].departure
    const answer = departuresFromBoard(
      night,
      { fetched: NIGHT, nextDue: NIGHT + 60_000, trips: [] },
      findStop(night, first.id)!,
      {
        answer: {
          Departure: [
            departure({
              stop: first.name,
              stopExtId: first.id,
              date: '2026-06-17',
              time: clockTime(leaving, ZONE, { seconds: true }),
              rtDate: '2026-06-17',
              rtTime: clockTime(leaving, ZONE, { seconds: true }),
              direction: tomorrow.headsign,
              name: tomorrow.line.name,
              ProductAtStop: { line: tomorrow.line.name },
            }),
          ],
        },
        at: NIGHT,
      },
      NIGHT,
    )
    expect(answer.departures.map((row) => row.trip)).toEqual([tomorrow.key])
  })
})
