import { describe, expect, it } from 'vitest'
import { fixtureTimetable } from '../testing'
import { WEEKDAY } from './scenarios'
import { delays, worldAt, type SimulationSettings } from './world'

const MOMENT = Date.UTC(2026, 5, 16, 5, 20, 30)
const MINUTE = 60_000

const settings: SimulationSettings = {
  timetable: await fixtureTimetable(),
  scenario: WEEKDAY,
  seed: 1,
}

describe('the simulated world', () => {
  it("drifts each trip's delay by at most the scenario's step a minute", () => {
    for (const trip of settings.timetable.tripsOn('2026-06-16')) {
      const start = Math.floor(trip.calls[0].departure / MINUTE)
      const delayAt = delays(settings, trip, start + 60)
      for (let m = start; m < start + 60; m++) {
        expect(Math.abs(delayAt(m + 1) - delayAt(m))).toBeLessThanOrEqual(WEEKDAY.drift)
      }
    }
  })

  it('gives a past minute the same delay whenever it is asked', () => {
    const [trip] = settings.timetable.tripsOn('2026-06-16')
    const start = Math.floor(trip.calls[0].departure / MINUTE)
    expect(delays(settings, trip, start + 10)(start + 5)).toBe(
      delays(settings, trip, start + 40)(start + 5),
    )
  })

  it('runs trips late by whole minutes, keeping the Metro on its plan', () => {
    const { trips } = worldAt(settings, MOMENT)
    expect(trips.some((t) => t.delay !== 0)).toBe(true)
    const offPlan = (t: (typeof trips)[number]) =>
      t.calls.map((call, i) => call.departure - t.trip.calls[i].departure)
    for (const simulated of trips) {
      expect(Math.abs(simulated.delay % 60)).toBe(0)
      expect(offPlan(simulated).every((late) => late % MINUTE === 0)).toBe(true)
    }
    const metro = trips.filter((t) => t.trip.line.mode === 'metro')
    expect(metro.flatMap(offPlan).every((late) => late === 0)).toBe(true)
  })

  it('keeps the delay a trip had at the calls behind it', () => {
    const before = worldAt(settings, MOMENT)
    const after = worldAt(settings, MOMENT + 20 * MINUTE)
    const left = (calls: readonly { departure: number }[]) =>
      calls.flatMap((call, i) => (call.departure <= MOMENT ? [i] : []))
    const kept = before.trips.flatMap((earlier) => {
      const later = after.trips.find((t) => t.trip.key === earlier.trip.key)
      return later ? left(earlier.calls).map((i) => [earlier.calls[i], later.calls[i]]) : []
    })
    expect(kept.length).toBeGreaterThan(0)
    for (const [earlier, later] of kept) expect(later.departure).toBe(earlier.departure)
  })

  it('never makes a Metro trip report', () => {
    const { trips } = worldAt(settings, MOMENT)
    const metro = trips.filter((t) => t.trip.line.mode === 'metro')
    expect(metro.length).toBeGreaterThan(0)
    expect(metro.some((t) => t.reports || t.carried)).toBe(false)
  })
})
