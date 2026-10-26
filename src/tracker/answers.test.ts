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
    expect(detail).toMatchObject({
      key: late.key,
      delay: 120,
      state: 'estimated',
      source: { kind: 'timetable' },
    })
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

  it('names the line’s colour', () => {
    expect(tripDetailFrom(timetable, delayed, late.key, MOMENT)?.colour).toBe(late.line.colour)
  })

  it('marks a cancelled trip, and a call it skips', () => {
    const whole = snapshot([{ key: late.key, state: 'estimated', cancelled: true }])
    expect(tripDetailFrom(timetable, whole, late.key, MOMENT)?.cancelled).toBe(true)
    const skips = snapshot([{ key: late.key, state: 'estimated', cancelledCalls: [ahead] }])
    const detail = tripDetailFrom(timetable, skips, late.key, MOMENT)!
    expect(detail.cancelled).toBeUndefined()
    expect(detail.calls.filter((call) => call.cancelled).map((call) => call.index)).toEqual([ahead])
  })

  it('gives a Metro trip the interval its line keeps this hour, and other trips none', () => {
    // M1 towards Vestamager leaves each platform at 07:03 and 07:07, the fixture's two trips.
    const metro = 'metro.M1.7f21f99145.20260616.0707'
    expect(tripDetailFrom(timetable, delayed, metro, MOMENT)?.interval).toEqual({ from: 4, to: 4 })
    expect(tripDetailFrom(timetable, delayed, late.key, MOMENT)?.interval).toBeUndefined()
  })

  it('reads a Metro trip as its stops’ departures do: to an interval until its line has realtime', () => {
    const metro = 'metro.M1.7f21f99145.20260616.0707'
    const planned = tripDetailFrom(timetable, delayed, metro, MOMENT)!
    expect(planned.runsToInterval).toBe(true)
    // Another M1 trip carried realtime: the line, and so this trip, leaves the interval rule.
    const other = timetable
      .tripsOn(today)
      .find((trip) => trip.line.name === 'M1' && trip.key !== metro)!
    const live = snapshot([{ key: other.key, line: 'M1', mode: 'metro', hadRealtime: true }])
    const detail = tripDetailFrom(timetable, live, metro, MOMENT)!
    expect(detail.runsToInterval).toBeUndefined()
    expect(detail.interval).toBeUndefined()
    expect(tripDetailFrom(timetable, delayed, late.key, MOMENT)?.runsToInterval).toBeUndefined()
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
    expect(board.stop).toMatchObject({ id: stop.id, name: stop.name })
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

  it('says its times come from the timetable', () => {
    expect(stopDeparturesFrom(timetable, delayed, stop.id)?.source).toEqual({ kind: 'timetable' })
  })

  it('names the lines that call at the stop, in their colours', () => {
    const board = stopDeparturesFrom(timetable, delayed, stop.id)!
    expect(board.stop.lines).toContainEqual({
      name: late.line.name,
      mode: late.line.mode,
      colour: late.line.colour,
    })
    const row = board.departures.find((each) => each.trip === late.key)
    expect(row?.colour).toBe(late.line.colour)
  })

  it('looks 30 minutes ahead', () => {
    // The fixture's stop has a departure 30 to 60 minutes on, which the board leaves out.
    const later = timetable
      .tripsOn(today)
      .flatMap((trip) => trip.calls.slice(0, -1))
      .filter((call) => timetable.stops.platforms[call.platform].stop === platform.stop)
      .some(
        (call) => call.departure > MOMENT + 31 * 60_000 && call.departure < MOMENT + 60 * 60_000,
      )
    expect(later).toBe(true)
    const board = stopDeparturesFrom(timetable, snapshot([]), stop.id)!
    expect(board.departures.length).toBeGreaterThan(0)
    for (const row of board.departures)
      expect(row.scheduled).toBeLessThanOrEqual(MOMENT + 30 * 60_000)
  })

  it('keeps a cancelled trip’s departure, marked cancelled', () => {
    const cancelled = snapshot([{ key: late.key, state: 'estimated', cancelled: true }])
    const row = stopDeparturesFrom(timetable, cancelled, stop.id)!.departures.find(
      (each) => each.trip === late.key,
    )
    expect(row?.cancelled).toBe(true)
  })

  it('marks a departure cancelled when its trip skips this call', () => {
    const skips = snapshot([{ key: late.key, state: 'estimated', cancelledCalls: [ahead] }])
    const rows = stopDeparturesFrom(timetable, skips, stop.id)!.departures
    expect(rows.find((each) => each.trip === late.key)?.cancelled).toBe(true)
    expect(rows.filter((each) => each.trip !== late.key).every((each) => !each.cancelled)).toBe(
      true,
    )
  })

  it('lists a No signal trip by its timetabled time, which its row shows', () => {
    // Forty minutes late by its last delay, which would take it past the half hour.
    const lost = snapshot([{ key: late.key, delay: 40 * 60, state: 'no-signal' }])
    const rows = stopDeparturesFrom(timetable, lost, stop.id)!.departures
    const row = rows.find((each) => each.trip === late.key)
    expect(row).toMatchObject({ scheduled: late.calls[ahead].departure, state: 'no-signal' })
    const times = rows.map((each) =>
      each.trip === late.key ? each.scheduled : (each.expected ?? each.scheduled),
    )
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('finds a stop by a platform’s id', () => {
    expect(stopDeparturesFrom(timetable, delayed, platform.id)?.stop.id).toBe(stop.id)
  })

  it('has no answer for a stop the timetable doesn’t know', () => {
    expect(stopDeparturesFrom(timetable, delayed, 'no such stop')).toBeUndefined()
  })
})

describe('a Metro platform’s departures', () => {
  // The fixture's M1 leaves each of its stations every 4 minutes each way in the hour from 07:00.
  const BELLA_CENTER = '8603313'
  const NORREPORT = '27532'
  /** 07:05, when M1 leaves Nørreport both ways in the next half hour, among buses and S-tog. */
  const EARLY = Date.UTC(2026, 5, 16, 5, 5)
  const at = (moment: number, trips: readonly Partial<SnapshotTrip>[] = []): SnapshotDelays => ({
    fetched: moment,
    nextDue: moment + 60_000,
    trips: trips as SnapshotTrip[],
  })
  const metroTrip = timetable
    .tripsOn(today)
    .find((trip) => trip.line.mode === 'metro' && trip.headsign.startsWith('Vestamager'))!

  it('reads as an interval for each direction leaving in the next half hour, with no times', () => {
    const answer = stopDeparturesFrom(timetable, at(MOMENT), BELLA_CENTER)!
    expect(answer.departures).toEqual([])
    expect(answer.intervals).toEqual([
      {
        line: 'M1',
        mode: 'metro',
        colour: 'perron-color-transit-line-m1',
        headsign: 'Vestamager St. (Metro)',
        platform: BELLA_CENTER,
        every: { from: 4, to: 4 },
      },
    ])
  })

  it('gives the Metro intervals and the buses and S-tog departures at a stop with both', () => {
    const answer = stopDeparturesFrom(timetable, at(EARLY), NORREPORT)!
    expect(answer.intervals.map(({ headsign, every }) => [headsign, every])).toEqual([
      ['Vanløse St. (Metro)', { from: 4, to: 4 }],
      ['Vestamager St. (Metro)', { from: 4, to: 4 }],
    ])
    expect(answer.departures.length).toBeGreaterThan(0)
    expect(answer.departures.some((row) => row.mode === 'metro')).toBe(false)
  })

  it('lists a Metro line’s departures as any line’s once the snapshot carried its realtime', () => {
    const live = at(MOMENT, [
      { key: metroTrip.key, line: 'M1', mode: 'metro', state: 'live', hadRealtime: true },
    ])
    const answer = stopDeparturesFrom(timetable, live, BELLA_CENTER)!
    expect(answer.intervals).toEqual([])
    expect(answer.departures.map((row) => [row.line, row.headsign])).toEqual([
      ['M1', 'Vestamager St. (Metro)'],
      ['M1', 'Vestamager St. (Metro)'],
    ])
  })
})
