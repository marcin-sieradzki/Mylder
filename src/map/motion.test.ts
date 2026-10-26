import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readNetwork } from '../timetable/network.ts'
import type { Snapshot, SnapshotTrip } from '../tracker/index.ts'
import { motionOf, placeAt, type Motion } from './motion.ts'

// The weekday recording's sixth and seventh minutes, a minute apart, on its own timetable: the
// fixture timetable's real patterns and paths.
const recording = join(process.cwd(), 'recordings', 'weekday')
const read = (path: string): unknown => JSON.parse(readFileSync(join(recording, path), 'utf8'))
const manifest = read('timetable/manifest.json') as { files: Record<string, string> }
const network = readNetwork({
  manifest,
  stops: read(`timetable/${manifest.files.stops}`),
  patterns: read(`timetable/${manifest.files.patterns}`),
  paths: read(`timetable/${manifest.files.paths}`),
})
const minute6 = read('snapshots/0006.json') as Snapshot
const minute7 = read('snapshots/0007.json') as Snapshot
const FETCHED = minute6.fetched
const s = (seconds: number) => FETCHED + seconds * 1000

const A_LIVE = 's-tog.A.0bc307e3eb.20260616.0707'
const WAITING = 'bus.991.7ce514fd98.20260616.0730'
const M1_LAST_LEG = 'metro.M1.7f21f99145.20260616.0703'

const tripOf = (snapshot: Snapshot, key: string): SnapshotTrip => {
  const trip = snapshot.trips.find((each) => each.key === key)
  if (!trip) throw new Error(`${key} is not in the snapshot`)
  return trip
}

/** A trip's motion from a snapshot, from where its dot was drawn when the snapshot landed. */
const motion = (
  key: string,
  snapshot: Snapshot = minute6,
  drawn?: { progress: number; at: number },
  change: Partial<SnapshotTrip> = {},
): Motion => {
  const trip = { ...tripOf(snapshot, key), ...change }
  return motionOf(trip, snapshot.fetched, network.pathOf(trip.pattern), drawn)
}

const progressAt = (moving: Motion, time: number) => Math.round(placeAt(moving, time).progress)

describe('where a dot is drawn between polls', () => {
  it('moves at constant speed from its progress at fetch to each next call at its time', () => {
    // A at 12,550 m at fetch, at its next call (14,350 m) 60 s later, then 15,040 m at 180 s.
    const a = motion(A_LIVE)
    expect(progressAt(a, s(0))).toBe(12550)
    expect(progressAt(a, s(30))).toBe(13450)
    expect(progressAt(a, s(60))).toBe(14350)
    expect(progressAt(a, s(120))).toBe(14695)
  })

  it('places a page opened mid-minute where the trip is now, not where it was at fetch', () => {
    // Opened 34 s after the snapshot was fetched: 34/60 of the way to the next call.
    expect(progressAt(motion(A_LIVE), s(34))).toBe(13570)
  })

  it('holds a Waiting trip at its first stop until it leaves', () => {
    // The 991 waits at its first stop (0 m) until 300 s, then runs 2,724 m to its next by 1,680 s.
    const waiting = motion(WAITING)
    expect(progressAt(waiting, s(0))).toBe(0)
    expect(progressAt(waiting, s(299))).toBe(0)
    expect(progressAt(waiting, s(990))).toBe(1362)
  })

  it('carries the last speed on past the last next call until the next snapshot', () => {
    // A runs 726 m in the 120 s before its third next call (15,766 m at 300 s); 60 s more is 363 m.
    expect(progressAt(motion(A_LIVE), s(360))).toBe(16129)
  })

  it("never runs past the pattern's end", () => {
    // M1 reaches its last stop, the path's end at 13,743 m, 60 s after fetch.
    const m1 = motion(M1_LAST_LEG)
    expect(progressAt(m1, s(60))).toBe(13743)
    expect(progressAt(m1, s(600))).toBe(13743)
  })
})

describe('where a dot goes when a new snapshot lands', () => {
  // The seventh minute was fetched at 60 s and lands at 65 s. On the sixth minute's timeline A
  // is drawn at 14,379 m then; the seventh agrees, unless a report moves it.
  const LANDED = s(65)
  const drawn = { progress: placeAt(motion(A_LIVE), LANDED).progress, at: LANDED }
  /** A's motion from the seventh minute, with its progress at fetch moved by a report. */
  const reported = (progress: number) => motion(A_LIVE, minute7, drawn, { progress })

  it('carries on unchanged when the new timeline agrees with the old', () => {
    const same = motion(A_LIVE, minute7, drawn)
    expect(progressAt(same, LANDED)).toBe(14379)
    expect(progressAt(same, s(100))).toBe(14580)
  })

  it('eases along the path, over about a second, to a target under 500 m ahead', () => {
    // Reported 300 m further on, at 14,650 m at 60 s, and 15,040 m at 180 s.
    const ahead = reported(14650)
    expect(progressAt(ahead, LANDED)).toBe(14379)
    const halfway = progressAt(ahead, LANDED + 500)
    expect(halfway).toBeGreaterThan(14450)
    expect(halfway).toBeLessThan(14600)
    // A second on, the dot is on the new timeline: 14,650 m plus 6 s at 3.25 m/s.
    expect(placeAt(ahead, LANDED + 1000).progress).toBeCloseTo(14669.5, 0)
    expect(placeAt(ahead, LANDED + 500).opacity).toBe(1)
  })

  it('eases back, too, to a target more than 150 m behind', () => {
    // Reported 300 m short, at 14,050 m at 60 s: the drawn dot is 260 m ahead of its target.
    const behind = reported(14050)
    expect(progressAt(behind, LANDED)).toBe(14379)
    expect(progressAt(behind, LANDED + 500)).toBeLessThan(14300)
    // 14,050 m plus 6 s at 8.25 m/s.
    expect(placeAt(behind, LANDED + 1000).progress).toBeCloseTo(14099.5, 0)
  })

  it('holds still at a target under 150 m behind until the new timeline catches up', () => {
    // Reported 100 m short, at 14,250 m at 60 s, then 6.58 m/s: it reaches 14,379 m at 79.6 s.
    const jitter = reported(14250)
    expect(progressAt(jitter, LANDED + 500)).toBe(14379)
    expect(progressAt(jitter, s(70))).toBe(14379)
    expect(progressAt(jitter, s(79))).toBe(14379)
    expect(progressAt(jitter, s(91))).toBe(14454)
  })

  it('fades and jumps to a target 500 m or more away, never drawing a point between', () => {
    // Reported 800 m further on, at 15,150 m at 60 s, then 15,766 m at 300 s.
    const far = reported(15150)
    const fading = placeAt(far, LANDED + 100)
    expect(Math.round(fading.progress)).toBe(14379)
    expect(fading.opacity).toBeLessThan(1)
    for (let after = 0; after <= 1000; after += 50) {
      const progress = progressAt(far, LANDED + after)
      expect(progress === 14379 || progress >= 15162).toBe(true)
    }
    // A second on, it is on the new timeline: 15,150 m plus 6 s at 2.57 m/s, wholly drawn.
    const landed = placeAt(far, LANDED + 1000)
    expect(landed.progress).toBeCloseTo(15165.4, 0)
    expect(landed.opacity).toBe(1)
  })
})
