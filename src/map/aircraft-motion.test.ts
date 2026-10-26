import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { distance } from '../domain/trip-motion.ts'
import type { AircraftSnapshot, SnapshotAircraft } from '../tracker/aircraft/index.ts'
import { aircraftAt, aircraftMotionOf } from './aircraft-motion.ts'

// The weekday recording's last aircraft snapshot: SAS4304 on final to Kastrup at 118.3 kn
// (60.86 m/s) on a track of 221.23°, its position broadcast 0.1 s before the fetch; NSZ3213, just
// landed, taxiing at 21.5 kn on the ground.
const snapshot = JSON.parse(
  readFileSync(
    join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', '0018.json'),
    'utf8',
  ),
) as AircraftSnapshot
const s = (seconds: number) => snapshot.fetched + seconds * 1000

const aircraftOf = (hex: string): SnapshotAircraft => {
  const found = snapshot.aircraft.find((each) => each.hex === hex)
  if (!found) throw new Error(`${hex} is not in the snapshot`)
  return found
}
const SAS4304 = aircraftOf('4acaa6')
const NSZ3213 = aircraftOf('47873f')

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
    const motion = aircraftMotionOf(SAS4304, snapshot, 'live')
    // 0.1 s after its position at the fetch, 5.1 s after it 5 s later.
    expect(apart(fixOf(SAS4304), aircraftAt(motion, s(0)))).toBeCloseTo(6.09, 0)
    expect(apart(fixOf(SAS4304), aircraftAt(motion, s(5)))).toBeCloseTo(310.38, 0)
    expect(bearing(fixOf(SAS4304), aircraftAt(motion, s(5)))).toBeCloseTo(221.23, 1)
  })

  it('stops one poll interval past its position’s time, until the next poll', () => {
    const motion = aircraftMotionOf(SAS4304, snapshot, 'live')
    // Its position is from 0.1 s before the fetch: it moves for 10 s, to 9.9 s after the fetch.
    const stopped = aircraftAt(motion, s(9.9))
    expect(apart(fixOf(SAS4304), stopped)).toBeCloseTo(608.59, 0)
    expect(aircraftAt(motion, s(15))).toEqual(stopped)
    expect(aircraftAt(motion, s(60))).toEqual(stopped)
  })

  it('moves an Ageing or Estimated aircraft the same way', () => {
    for (const state of ['ageing', 'estimated'] as const) {
      const motion = aircraftMotionOf(SAS4304, snapshot, state)
      expect(apart(fixOf(SAS4304), aircraftAt(motion, s(5)))).toBeCloseTo(310.38, 0)
    }
  })

  it('keeps an aircraft on the ground where it is, taxiing or not', () => {
    const motion = aircraftMotionOf(NSZ3213, snapshot, 'live')
    expect(aircraftAt(motion, s(0))).toEqual(fixOf(NSZ3213))
    expect(aircraftAt(motion, s(5))).toEqual(fixOf(NSZ3213))
  })

  it('keeps a No signal aircraft at its last fix', () => {
    const motion = aircraftMotionOf(SAS4304, snapshot, 'no-signal')
    expect(aircraftAt(motion, s(5))).toEqual(fixOf(SAS4304))
  })

  it('glides from where it was drawn to its new place within a second, when that is near', () => {
    const drawn = { point: fixOf(SAS4304), at: s(0) }
    const motion = aircraftMotionOf(SAS4304, snapshot, 'live', drawn)
    expect(aircraftAt(motion, s(0))).toEqual(fixOf(SAS4304))
    const halfway = apart(fixOf(SAS4304), aircraftAt(motion, s(0.5)))
    expect(halfway).toBeGreaterThan(0)
    expect(halfway).toBeLessThan(36.52)
    expect(apart(fixOf(SAS4304), aircraftAt(motion, s(1)))).toBeCloseTo(66.94, 0)
  })

  it('jumps to its new place when it was drawn far from it', () => {
    const far: [number, number] = [SAS4304.lon + 0.1, SAS4304.lat]
    const motion = aircraftMotionOf(SAS4304, snapshot, 'live', { point: far, at: s(0) })
    expect(apart(fixOf(SAS4304), aircraftAt(motion, s(0)))).toBeCloseTo(6.09, 0)
  })
})
