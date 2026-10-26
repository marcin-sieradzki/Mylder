import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { distance } from '../domain/trip-motion.ts'
import type { AircraftSnapshot, SnapshotAircraft } from '../tracker/aircraft/index.ts'
import { aircraftAt, aircraftMotionOf } from './aircraft-motion.ts'

// The weekday recording's sixth aircraft snapshot: SAS1426 on approach to Kastrup at 142 kn
// (73.05 m/s) on a track of 224°, its position broadcast 1 s before the fetch; SAS2863 taxiing at
// 14 kn on the ground.
const snapshot = JSON.parse(
  readFileSync(
    join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', '0006.json'),
    'utf8',
  ),
) as AircraftSnapshot
const s = (seconds: number) => snapshot.fetched + seconds * 1000

const aircraftOf = (hex: string): SnapshotAircraft => {
  const found = snapshot.aircraft.find((each) => each.hex === hex)
  if (!found) throw new Error(`${hex} is not in the snapshot`)
  return found
}
const SAS1426 = aircraftOf('45ac2d')
const SAS2863 = aircraftOf('45ab45')

/** The fix: where the answer placed the aircraft, as longitude and latitude. */
const fixOf = (aircraft: SnapshotAircraft): [number, number] => [aircraft.lon, aircraft.lat]

/** Metres from `a` to `b`, both longitude and latitude. */
const apart = ([lon1, lat1]: readonly number[], [lon2, lat2]: readonly number[]) =>
  distance([lat1, lon1], [lat2, lon2])

/** Which way `b` lies from `a`, in degrees clockwise from north. */
function bearing([lon1, lat1]: readonly number[], [lon2, lat2]: readonly number[]): number {
  const east = (lon2 - lon1) * Math.cos((lat1 * Math.PI) / 180)
  const north = lat2 - lat1
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360
}

describe('where an aircraft is drawn between polls', () => {
  it('moves from its position along its track at its ground speed', () => {
    const motion = aircraftMotionOf(SAS1426, snapshot, 'live')
    // 1 s after its position at the fetch, 6 s after it 5 s later.
    expect(apart(fixOf(SAS1426), aircraftAt(motion, s(0)))).toBeCloseTo(73.05, 0)
    expect(apart(fixOf(SAS1426), aircraftAt(motion, s(5)))).toBeCloseTo(438.3, 0)
    expect(bearing(fixOf(SAS1426), aircraftAt(motion, s(5)))).toBeCloseTo(224, 1)
  })

  it('stops one poll interval past its position’s time, until the next poll', () => {
    const motion = aircraftMotionOf(SAS1426, snapshot, 'live')
    // Its position is from 1 s before the fetch: it moves for 10 s, to 9 s after the fetch.
    const stopped = aircraftAt(motion, s(9))
    expect(apart(fixOf(SAS1426), stopped)).toBeCloseTo(730.5, 0)
    expect(aircraftAt(motion, s(15))).toEqual(stopped)
    expect(aircraftAt(motion, s(60))).toEqual(stopped)
  })

  it('moves an Ageing or Estimated aircraft the same way', () => {
    for (const state of ['ageing', 'estimated'] as const) {
      const motion = aircraftMotionOf(SAS1426, snapshot, state)
      expect(apart(fixOf(SAS1426), aircraftAt(motion, s(5)))).toBeCloseTo(438.3, 0)
    }
  })

  it('keeps an aircraft on the ground where it is, taxiing or not', () => {
    const motion = aircraftMotionOf(SAS2863, snapshot, 'live')
    expect(aircraftAt(motion, s(0))).toEqual(fixOf(SAS2863))
    expect(aircraftAt(motion, s(5))).toEqual(fixOf(SAS2863))
  })

  it('keeps a No signal aircraft at its last fix', () => {
    const motion = aircraftMotionOf(SAS1426, snapshot, 'no-signal')
    expect(aircraftAt(motion, s(5))).toEqual(fixOf(SAS1426))
  })

  it('glides from where it was drawn to its new place within a second, when that is near', () => {
    const drawn = { point: fixOf(SAS1426), at: s(0) }
    const motion = aircraftMotionOf(SAS1426, snapshot, 'live', drawn)
    expect(aircraftAt(motion, s(0))).toEqual(fixOf(SAS1426))
    const halfway = apart(fixOf(SAS1426), aircraftAt(motion, s(0.5)))
    expect(halfway).toBeGreaterThan(0)
    expect(halfway).toBeLessThan(109.6)
    expect(apart(fixOf(SAS1426), aircraftAt(motion, s(1)))).toBeCloseTo(146.1, 0)
  })

  it('jumps to its new place when it was drawn far from it', () => {
    const far: [number, number] = [SAS1426.lon + 0.1, SAS1426.lat]
    const motion = aircraftMotionOf(SAS1426, snapshot, 'live', { point: far, at: s(0) })
    expect(apart(fixOf(SAS1426), aircraftAt(motion, s(0)))).toBeCloseTo(73.05, 0)
  })
})
