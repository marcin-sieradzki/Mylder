import { describe, expect, it } from 'vitest'
import {
  delayOf,
  intervalOf,
  measurePath,
  pointAt,
  progressAt,
  timedCalls,
  tripAt,
  tripPhase,
  type Call,
  type LatLon,
} from './trip-motion'

const t0 = Date.UTC(2026, 9, 26, 7, 0)
const minutes = (n: number) => t0 + n * 60_000

// A pattern of three stops. The first segment leaves north, crosses east and comes back south, so
// its middle lies halfway along the crossing, away from the straight line between its stops.
const A: LatLon = [55.68, 12.5]
const B: LatLon = [55.68, 12.51]
const C: LatLon = [55.68, 12.53]
const path = measurePath([
  [A, [55.69, 12.5], [55.69, 12.51], B],
  [B, C],
])

// Leaves A at 07:00, at B from 07:10 to 07:11, arrives at C at 07:15.
const calls: Call[] = [
  { arrival: minutes(0), departure: minutes(0) },
  { arrival: minutes(10), departure: minutes(11) },
  { arrival: minutes(15), departure: minutes(15) },
]

function expectPoint(point: LatLon | undefined, [lat, lon]: LatLon) {
  expect(point?.[0]).toBeCloseTo(lat, 5)
  expect(point?.[1]).toBeCloseTo(lon, 5)
}

describe('measurePath', () => {
  it('puts each stop at the start of its segment and the last at the end', () => {
    expect(path.stops[0]).toBe(0)
    expect(path.stops[2]).toBe(path.length)
    expectPoint(pointAt(path, path.stops[1]), B)
    // The detour's legs are about 1,112 m, 627 m and 1,112 m; B to C is about 1,254 m.
    expect(path.stops[1]).toBeGreaterThan(2_840)
    expect(path.stops[1]).toBeLessThan(2_860)
    expect(path.length - path.stops[1]).toBeGreaterThan(1_245)
    expect(path.length - path.stops[1]).toBeLessThan(1_265)
  })
})

describe('tripAt', () => {
  it('places a trip halfway in time between two calls halfway along that segment’s path', () => {
    const trip = tripAt(timedCalls(calls), path, minutes(5))
    expect(trip?.phase).toBe('underway')
    expect(trip?.progress).toBeCloseTo(path.stops[1] / 2, 6)
    expectPoint(trip?.point, [55.69, 12.505])
  })

  it('holds a trip at a stop while it stands there', () => {
    const trip = tripAt(timedCalls(calls), path, minutes(10.5))
    expect(trip?.progress).toBeCloseTo(path.stops[1], 6)
    expectPoint(trip?.point, B)
  })

  it.each([
    [-5, 'waiting'],
    [-0.5, 'waiting'],
  ])('stands a trip %f min before its first departure at its first stop, Waiting', (at) => {
    const trip = tripAt(timedCalls(calls), path, minutes(at))
    expect(trip).toEqual({ phase: 'waiting', progress: 0, point: A })
  })

  it.each([
    ['more than 5 min before its first departure', -5.01],
    ['once it has arrived at its last stop', 15],
    ['an hour after it arrived', 75],
  ])('leaves a trip off the map %s', (_, at) => {
    expect(tripAt(timedCalls(calls), path, minutes(at))).toBeUndefined()
  })

  it('shifts the position by the delayed times', () => {
    const late = timedCalls(calls, 120)
    const onTime = timedCalls(calls)
    for (const at of [1, 4, 9.5, 10.5, 12, 14]) {
      expect(tripAt(late, path, minutes(at + 2))?.progress).toBeCloseTo(
        tripAt(onTime, path, minutes(at))?.progress ?? NaN,
        6,
      )
    }
    expect(tripAt(late, path, minutes(16))?.phase).toBe('underway')
  })
})

describe('tripPhase', () => {
  it.each([
    [-6, 'upcoming'],
    [-5, 'waiting'],
    [0, 'underway'],
    [14.99, 'underway'],
    [15, 'finished'],
  ])('at %f min is %s', (at, phase) => {
    expect(tripPhase(timedCalls(calls), minutes(at))).toBe(phase)
  })
})

describe('progressAt', () => {
  it('stops a trip past its last expected call at the pattern’s end', () => {
    const timeline = [
      { time: minutes(10), progress: path.stops[1] },
      { time: minutes(15), progress: path.length },
    ]
    expect(progressAt(timeline, minutes(20), path.length)).toBe(path.length)
  })

  it('carries a trip on at its last speed past its last expected call, never beyond the pattern’s end', () => {
    // From the fetch to its next call it covers 600 m in a minute.
    const timeline = [
      { time: minutes(0), progress: 1_000 },
      { time: minutes(1), progress: 1_600 },
    ]
    expect(progressAt(timeline, minutes(2), path.length)).toBeCloseTo(2_200, 6)
    expect(progressAt(timeline, minutes(30), path.length)).toBe(path.length)
  })

  it('holds a trip before its timeline starts', () => {
    expect(progressAt([{ time: minutes(1), progress: 500 }], minutes(0), path.length)).toBe(500)
  })
})

describe('timedCalls', () => {
  it('gives the calls an update leaves out the scheduled time plus the latest delay', () => {
    const updated: Call[] = [
      { arrival: minutes(0), departure: minutes(0), expectedDeparture: minutes(1) },
      {
        arrival: minutes(10),
        departure: minutes(11),
        expectedArrival: minutes(13),
        expectedDeparture: minutes(14),
      },
      { arrival: minutes(15), departure: minutes(15) },
    ]
    expect(timedCalls(updated)).toEqual([
      { arrival: minutes(0), departure: minutes(1) },
      { arrival: minutes(13), departure: minutes(14) },
      { arrival: minutes(18), departure: minutes(18) },
    ])
  })

  it('never lets a time run back before the one before it', () => {
    const early: Call[] = [
      { arrival: minutes(0), departure: minutes(2), expectedDeparture: minutes(4) },
      { arrival: minutes(3), departure: minutes(3), expectedArrival: minutes(3) },
    ]
    expect(timedCalls(early)[1].arrival).toBe(minutes(4))
  })
})

describe('delayOf', () => {
  it.each<[string, Call[], number | undefined]>([
    ['with no expected time', calls, undefined],
    [
      'from the latest call with an expected time',
      [
        { arrival: minutes(0), departure: minutes(0), expectedDeparture: minutes(1) },
        { arrival: minutes(10), departure: minutes(11), expectedDeparture: minutes(14) },
        { arrival: minutes(15), departure: minutes(15) },
      ],
      180,
    ],
    [
      'negative when early, from an arrival at the last stop',
      [
        { arrival: minutes(0), departure: minutes(0) },
        { arrival: minutes(15), departure: minutes(15), expectedArrival: minutes(14.5) },
      ],
      -30,
    ],
  ])('a trip %s is %s s late', (_, trip, delay) => {
    expect(delayOf(trip)).toBe(delay)
  })
})

describe('intervalOf', () => {
  const hour = (h: number) => Date.UTC(2026, 9, 26, h)
  // An M3 platform's planned departures, one direction, by minute past the hour.
  const m3 = {
    rush: [0, 3, 7, 10, 13, 17, 20, 23, 27, 30, 33, 37, 40, 43, 47, 50, 53, 57],
    evening: [0, 6, 12, 18, 24, 30, 36, 42, 48, 54],
    even: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57],
  }
  const departures = (h: number, past: number[]) => past.map((m) => hour(h) + m * 60_000)

  it.each([
    ['every 3 to 4 min at rush hour', departures(8, m3.rush), 8, { from: 3, to: 4 }],
    ['every 6 min in the evening', departures(21, m3.evening), 21, { from: 6, to: 6 }],
    ['every 3 min when the gaps are even', departures(14, m3.even), 14, { from: 3, to: 3 }],
  ])('gives %s', (_, planned, h, interval) => {
    expect(intervalOf(planned, hour(h), hour(h + 1))).toEqual(interval)
  })

  it('reads only the hour asked for, in any order', () => {
    const planned = [...departures(21, m3.evening), ...departures(8, m3.rush)].reverse()
    expect(intervalOf(planned, hour(8), hour(9))).toEqual({ from: 3, to: 4 })
    expect(intervalOf(planned, hour(21), hour(22))).toEqual({ from: 6, to: 6 })
  })

  it('has no interval for an hour with fewer than two departures', () => {
    expect(intervalOf([hour(3)], hour(3), hour(4))).toBeUndefined()
  })
})
