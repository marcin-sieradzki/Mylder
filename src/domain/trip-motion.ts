// Where a trip is along its pattern at a moment, from its timed calls, as docs/data-states.md
// ("Where a trip is drawn") and docs/live-data.md ("The browser") give it. The tracker, the
// simulated Rejseplanen and the browser all move trips by these rules. Times are milliseconds
// since the epoch; distances are metres along the pattern's path.

/** A point as latitude and longitude, the order the timetable's paths use. */
export type LatLon = readonly [lat: number, lon: number]

/** A pattern's path, measured: its points, how far along each lies, and where each stop is. */
export interface MeasuredPath {
  readonly points: readonly LatLon[]
  /** Each point's distance from the start of the path. */
  readonly distances: readonly number[]
  /** Each stop's distance from the start of the path, in calling order. */
  readonly stops: readonly number[]
  readonly length: number
}

/** One call of a trip, with its planned times and the expected ones an update gave. */
export interface Call {
  readonly arrival: number
  readonly departure: number
  readonly expectedArrival?: number
  readonly expectedDeparture?: number
}

/** One call's times as the trip will keep them: expected where known, else planned plus delay. */
export interface TimedCall {
  readonly arrival: number
  readonly departure: number
}

/** A trip's progress along its path at moments, which it moves between at constant speed. */
export type Timeline = readonly { readonly time: number; readonly progress: number }[]

/**
 * Where a trip is in its day: not yet on the map, Waiting at its first stop, underway, or
 * finished at its last.
 */
export type TripPhase = 'upcoming' | 'waiting' | 'underway' | 'finished'

/** A trip on the map at a moment. */
export interface TripPlace {
  readonly phase: 'waiting' | 'underway'
  readonly progress: number
  readonly point: LatLon
}

/** A trip stands Waiting at its first stop from this long before its first departure. */
export const WAITING_FROM = 5 * 60_000

const EARTH_RADIUS = 6_371_000

/** The distance between two nearby points, in metres. Exact enough across a city. */
function distance([lat1, lon1]: LatLon, [lat2, lon2]: LatLon): number {
  const rad = Math.PI / 180
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad)
  const y = (lat2 - lat1) * rad
  return Math.hypot(x, y) * EARTH_RADIUS
}

/**
 * Measures a pattern's path from its stop-to-stop segments, one per pair of stops in calling
 * order, each running from its stop to the next.
 */
export function measurePath(segments: readonly (readonly LatLon[])[]): MeasuredPath {
  const points: LatLon[] = []
  const distances: number[] = []
  const stops: number[] = []
  for (const segment of segments) {
    stops.push(distances.at(-1) ?? 0)
    for (const point of segment) {
      const last = points.at(-1)
      if (last && last[0] === point[0] && last[1] === point[1]) continue
      distances.push(last ? distances.at(-1)! + distance(last, point) : 0)
      points.push(point)
    }
  }
  const length = distances.at(-1) ?? 0
  stops.push(length)
  return { points, distances, stops, length }
}

/** The point a distance along the path, clamped to its ends. */
export function pointAt(path: MeasuredPath, along: number): LatLon {
  const { points, distances } = path
  if (points.length === 0) throw new Error('A path needs at least one point')
  if (along <= 0) return points[0]
  if (along >= path.length) return points.at(-1)!
  let i = 1
  while (distances[i] < along) i++
  const share = (along - distances[i - 1]) / (distances[i] - distances[i - 1])
  const [lat1, lon1] = points[i - 1]
  const [lat2, lon2] = points[i]
  return [lat1 + (lat2 - lat1) * share, lon1 + (lon2 - lon1) * share]
}

function delayAt(call: Call): number | undefined {
  if (call.expectedDeparture !== undefined) return call.expectedDeparture - call.departure
  if (call.expectedArrival !== undefined) return call.expectedArrival - call.arrival
  return undefined
}

/**
 * Seconds behind the timetable at the latest call with an expected time, negative when early,
 * or undefined when no call has one.
 */
export function delayOf(calls: readonly Call[]): number | undefined {
  for (let i = calls.length - 1; i >= 0; i--) {
    const delay = delayAt(calls[i])
    if (delay !== undefined) return delay / 1000
  }
  return undefined
}

/**
 * The times a trip will keep at each call: the expected ones where an update gave them, and in
 * the gaps the planned ones plus the latest delay before them, else plus `delay` (seconds), the
 * trip's last known delay. No time runs back before the one before it.
 */
export function timedCalls(calls: readonly Call[], delay = 0): TimedCall[] {
  let carried = delay * 1000
  let latest = -Infinity
  const atLeastLatest = (time: number) => (latest = Math.max(latest, time))
  return calls.map((call) => {
    const arrival = atLeastLatest(call.expectedArrival ?? call.arrival + carried)
    carried = delayAt(call) ?? carried
    const departure = atLeastLatest(call.expectedDeparture ?? call.departure + carried)
    return { arrival, departure }
  })
}

/** Where a trip is in its day at a moment. */
export function tripPhase(calls: readonly TimedCall[], now: number): TripPhase {
  const first = calls[0].departure
  if (now < first - WAITING_FROM) return 'upcoming'
  if (now < first) return 'waiting'
  if (now < calls.at(-1)!.arrival) return 'underway'
  return 'finished'
}

/** A trip's timeline from its timed calls: at each stop from its arrival to its departure. */
export function timelineOf(calls: readonly TimedCall[], path: MeasuredPath): Timeline {
  return calls.flatMap((call, i) => [
    { time: call.arrival, progress: path.stops[i] },
    { time: call.departure, progress: path.stops[i] },
  ])
}

/**
 * A trip's progress at a moment on its timeline. Before the timeline it holds at the start;
 * between two points it moves at constant speed; past the last it carries on at its last speed,
 * and never beyond the pattern's end.
 */
export function progressAt(timeline: Timeline, now: number, length: number): number {
  const first = timeline[0]
  if (now <= first.time) return first.progress
  for (let i = 1; i < timeline.length; i++) {
    const to = timeline[i]
    if (now > to.time) continue
    const from = timeline[i - 1]
    const share = to.time === from.time ? 1 : (now - from.time) / (to.time - from.time)
    return from.progress + (to.progress - from.progress) * share
  }
  const last = timeline.at(-1)!
  const before = timeline.at(-2)
  const speed =
    before && last.time > before.time
      ? (last.progress - before.progress) / (last.time - before.time)
      : 0
  return Math.min(last.progress + Math.max(speed, 0) * (now - last.time), length)
}

/**
 * A trip on the map at a moment, Waiting at its first stop or underway between its calls, or
 * undefined when it is not on the map: more than 5 minutes before its first departure, or
 * arrived at its last stop.
 */
export function tripAt(
  calls: readonly TimedCall[],
  path: MeasuredPath,
  now: number,
): TripPlace | undefined {
  const phase = tripPhase(calls, now)
  if (phase === 'upcoming' || phase === 'finished') return undefined
  const progress = progressAt(timelineOf(calls, path), now, path.length)
  return { phase, progress, point: pointAt(path, progress) }
}

/** How often an interval line leaves a stop, in whole minutes; equal ends when the gaps are even. */
export interface Interval {
  readonly from: number
  readonly to: number
}

/**
 * An interval line's interval from its planned departures at one stop in one direction, between
 * two moments (usually the current hour). The typical gap is the middle half of the gaps between
 * departures, so one short or long gap doesn't widen it; a range shows when its ends round to
 * different minutes, such as "every 3 to 4 min".
 */
export function intervalOf(
  departures: readonly number[],
  from: number,
  to: number,
): Interval | undefined {
  const times = departures.filter((time) => time >= from && time < to).sort((a, b) => a - b)
  if (times.length < 2) return undefined
  const gaps = times
    .slice(1)
    .map((time, i) => time - times[i])
    .sort((a, b) => a - b)
  const quantile = (q: number) => gaps[Math.floor(q * (gaps.length - 1))]
  const minutes = (gap: number) => Math.max(1, Math.round(gap / 60_000))
  return { from: minutes(quantile(0.25)), to: minutes(quantile(0.75)) }
}
