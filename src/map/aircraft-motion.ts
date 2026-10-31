// Where each aircraft is drawn between polls (docs/aircraft.md, "The browser"): from its
// position, along its track at its ground speed, for at most one poll interval past the
// position's time, then standing until the next answer. An aircraft on the ground, one with no
// track or speed, and a No signal one stand at their fix. When a new answer lands, a dot drawn
// near its new place glides there in a second, as a vehicle's does (motion.ts), and jumps from
// farther. Times are on the aircraft server's clock, in milliseconds since the epoch.
import 'client-only'
import type { AircraftState } from '../domain/aircraft-state.ts'
import { distance } from '../domain/trip-motion.ts'
import type { AircraftSnapshot, SnapshotAircraft } from '../tracker/aircraft/index.ts'
import { EASE_FOR } from './motion.ts'

/** A point as longitude and latitude, the order deck.gl takes. */
export type LonLat = readonly [lon: number, lat: number]

/** A new place this near the drawn dot, in metres, is glided to rather than jumped to. */
export const GLIDE_WITHIN = 1000

/** Knots in metres a second. */
const KNOT = 1852 / 3600

const EARTH_RADIUS = 6_371_000

/** Where a dot was drawn when its new answer landed. */
export interface DrawnPoint {
  readonly point: LonLat
  readonly at: number
}

/** An aircraft's way from its fix, and how its dot joins it. */
export interface AircraftMotion {
  /** Where the answer placed it. */
  readonly fix: LonLat
  /** When it was there: the snapshot's fetch less the position's age. */
  readonly time: number
  /** Its speed east and north, in degrees of longitude and latitude a millisecond. */
  readonly step: LonLat
  /** It moves until this moment, one poll interval past `time`, and stands after. */
  readonly until: number
  readonly from?: DrawnPoint
}

/** Whether an aircraft stands at its fix rather than moving on from it. */
const stands = (aircraft: SnapshotAircraft, state: AircraftState) =>
  state === 'no-signal' ||
  aircraft.altitude === 'ground' ||
  aircraft.track === undefined ||
  !aircraft.speed

/** Its speed along its track as degrees a millisecond east and north, at its latitude. */
function stepOf(aircraft: SnapshotAircraft): LonLat {
  const metres = ((aircraft.speed ?? 0) * KNOT) / 1000
  const track = ((aircraft.track ?? 0) * Math.PI) / 180
  const radians = 180 / Math.PI / EARTH_RADIUS
  const east = (metres * Math.sin(track) * radians) / Math.cos((aircraft.lat * Math.PI) / 180)
  return [east, metres * Math.cos(track) * radians]
}

const NO_STEP: LonLat = [0, 0]

/** Where the aircraft's own way has it at `now`, with no glide. */
function onWay({ fix, time, step, until }: AircraftMotion, now: number): LonLat {
  const since = Math.min(Math.max(now - time, 0), until - time)
  return [fix[0] + step[0] * since, fix[1] + step[1] * since]
}

/** Metres between two nearby points. */
const metresApart = ([lon1, lat1]: LonLat, [lon2, lat2]: LonLat) =>
  distance([lat1, lon1], [lat2, lon2])

/**
 * An aircraft's motion from `snapshot`, in its data state now. A dot already `drawn` glides to
 * its new place from there when that is under 1 km away; one not yet drawn starts on its way.
 */
export function aircraftMotionOf(
  aircraft: SnapshotAircraft,
  snapshot: Pick<AircraftSnapshot, 'fetched' | 'pollInterval'>,
  state: AircraftState,
  drawn?: DrawnPoint,
): AircraftMotion {
  const time = snapshot.fetched - aircraft.age * 1000
  const motion: AircraftMotion = {
    fix: [aircraft.lon, aircraft.lat],
    time,
    step: stands(aircraft, state) ? NO_STEP : stepOf(aircraft),
    until: time + snapshot.pollInterval * 1000,
  }
  if (!drawn || metresApart(drawn.point, onWay(motion, drawn.at)) >= GLIDE_WITHIN) return motion
  return { ...motion, from: drawn }
}

/** Slow out of the old place and into the new, 0 to 1. */
const smooth = (share: number) => share * share * (3 - 2 * share)

/** Where an aircraft's dot is drawn at `now`. */
export function aircraftAt(motion: AircraftMotion, now: number): LonLat {
  const target = onWay(motion, now)
  const { from } = motion
  const since = from ? now - from.at : EASE_FOR
  if (!from || since >= EASE_FOR) return target
  const share = smooth(Math.max(since, 0) / EASE_FOR)
  return [
    from.point[0] + (target[0] - from.point[0]) * share,
    from.point[1] + (target[1] - from.point[1]) * share,
  ]
}

/** Whether an aircraft's dot still moves at `now`: on its way, or gliding to it. */
export function movesAt(motion: AircraftMotion, now: number): boolean {
  const onItsWay = (motion.step[0] !== 0 || motion.step[1] !== 0) && now < motion.until
  return onItsWay || (motion.from !== undefined && now - motion.from.at < EASE_FOR)
}
