import { describe, expect, it } from 'vitest'
import {
  delayOf,
  delaySteps,
  expectedTimes,
  measurePath,
  pointAt,
  snapToPath,
  progressAt,
  timedCalls,
  timelineFrom,
  timelineOf,
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

describe('measurePath (gaps)', () => {
  it('puts a stop at its own segment’s start when the segment before stops short of it', () => {
    const gappy = measurePath([
      [A, [55.68, 12.505]],
      [B, C],
    ])
    expectPoint(pointAt(gappy, gappy.stops[1]), B)
    expect(gappy.length).toBeCloseTo(path.length - path.stops[1] + gappy.stops[1], 6)
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

describe('timelineFrom', () => {
  const timeline = timelineOf(timedCalls(calls), path)

  it('carries a position on to the next call it hasn’t reached, there on that call’s time', () => {
    // Seen at 07:05 three quarters of the way to B, where the timetable puts it halfway.
    const seen = { time: minutes(5), progress: (path.stops[1] * 3) / 4 }
    const carried = timelineFrom(timeline, seen)
    expect(carried[0]).toEqual(seen)
    expect(progressAt(carried, minutes(7.5), path.length)).toBeCloseTo((path.stops[1] * 7) / 8, 6)
    expect(progressAt(carried, minutes(10.5), path.length)).toBeCloseTo(path.stops[1], 6)
    expect(progressAt(carried, minutes(15), path.length)).toBeCloseTo(path.length, 6)
  })

  it('never runs a position back to a call it has passed', () => {
    // Seen at 07:09 already past B, which the timetable reaches at 07:10.
    const seen = { time: minutes(9), progress: path.stops[1] + 100 }
    const carried = timelineFrom(timeline, seen)
    expect(carried.every((point) => point.progress >= seen.progress)).toBe(true)
    expect(progressAt(carried, minutes(10.5), path.length)).toBeGreaterThan(seen.progress)
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
      { arrival: minutes(1), departure: minutes(1) },
      { arrival: minutes(13), departure: minutes(14) },
      { arrival: minutes(18), departure: minutes(18) },
    ])
  })

  it('runs the calls before an update’s first expected time late by its delay', () => {
    // An opened stop ahead says the trip will leave B 3 min late.
    const ahead: Call[] = [calls[0], { ...calls[1], expectedDeparture: minutes(14) }, calls[2]]
    expect(timedCalls(ahead)).toEqual([
      { arrival: minutes(3), departure: minutes(3) },
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

describe('delaySteps and expectedTimes', () => {
  // An update's calls: 2 min late away from A, 1 min early from B, so 1 min early at C.
  const updated: Call[] = [
    { arrival: minutes(0), departure: minutes(0), expectedDeparture: minutes(2) },
    { arrival: minutes(10), departure: minutes(11), expectedDeparture: minutes(10) },
    { arrival: minutes(15), departure: minutes(15) },
  ]

  it('lists each call an update gave an expected time, with its delay in seconds', () => {
    expect(delaySteps(updated)).toEqual([
      [0, 120],
      [1, -60],
    ])
    expect(delaySteps(calls)).toEqual([])
  })

  it('leaves out a call whose delay is the step before’s, which times the same', () => {
    const repeated: Call[] = [
      ...updated.slice(0, 2),
      { ...updated[2], expectedArrival: minutes(14), expectedDeparture: minutes(14) },
    ]
    expect(delaySteps(repeated)).toEqual(delaySteps(updated))
    expect(expectedTimes(calls, { steps: delaySteps(repeated) })).toEqual(timedCalls(repeated))
  })

  it('times each call by its steps, as the update’s calls are timed', () => {
    expect(expectedTimes(calls, { delay: -60, steps: delaySteps(updated) })).toEqual(
      timedCalls(updated),
    )
    // A step at the last stop gives its arrival.
    expect(expectedTimes(calls, { steps: [[2, 300]] })?.[2]).toEqual({
      arrival: minutes(20),
      departure: minutes(20),
    })
  })

  it('shifts every call by the delay without steps, and gives none with neither', () => {
    expect(expectedTimes(calls, { delay: 60 })).toEqual(timedCalls(calls, 60))
    expect(expectedTimes(calls, {})).toBeUndefined()
  })
})

describe('snapToPath', () => {
  it('puts a point a few metres off the path at the nearest point along it', () => {
    // 20 m north of the crossing's middle.
    const progress = snapToPath(path, [55.69 + 20 / 111_320, 12.505], 0)
    expect(progress).toBeCloseTo(path.stops[1] / 2, 0)
  })

  it('takes the stretch nearer the timetable’s guess where the path passes a point twice', () => {
    // Out and back along one street: the same point lies 500 m and 1,500 m along.
    const there: LatLon = [55.68, 12.5]
    const back: LatLon = [55.68 + 1_000 / 111_320, 12.5]
    const loop = measurePath([
      [there, back],
      [back, there],
    ])
    const middle: LatLon = [55.68 + 500 / 111_320, 12.5]
    expect(snapToPath(loop, middle, 400)).toBeCloseTo(loop.length / 4, 3)
    expect(snapToPath(loop, middle, 1_700)).toBeCloseTo((loop.length * 3) / 4, 3)
  })
})
