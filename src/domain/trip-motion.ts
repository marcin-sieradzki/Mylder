// Where a trip is along its pattern at a moment, from its timed calls, as docs/data-states.md
// ("Where a trip is drawn") and docs/live-data.md ("The browser") give it. The tracker, the
// simulated Rejseplanen and the browser all move trips by these rules. Times are milliseconds
// since the epoch; a delay is in seconds, as the snapshot carries it; distances are metres along
// the pattern's path.

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

/** One call of a trip: its scheduled times, and the expected ones the latest update gave. */
export interface Call {
  readonly arrival: number
  readonly departure: number
  readonly expectedArrival?: number
  readonly expectedDeparture?: number
}

/** One call's times as the trip will keep them: expected where known, else scheduled plus delay. */
export interface TimedCall {
  readonly arrival: number
  readonly departure: number
}

/** Where a trip is at a moment, as metres along its pattern's path. */
export interface Position {
  readonly time: number
  readonly progress: number
}

/** A trip's progress along its path at moments, which it moves between at constant speed. */
export type Timeline = readonly Position[]

/**
 * Where a trip is in its day: not yet on the map, Waiting at its first stop, underway, or
 * finished at its last.
 */
export type TripPhase = 'upcoming' | 'waiting' | 'underway' | 'finished'

/** A vehicle: a trip on the map at a moment, Waiting or underway, and where it is. */
export interface Vehicle {
  readonly phase: 'waiting' | 'underway'
  readonly progress: number
  readonly point: LatLon
}

/** A trip stands Waiting at its first stop from this long before its first departure. */
export const WAITING_FROM = 5 * 60_000

/**
 * A trip that ends at a stop counts as standing there for this long after it arrives, since no
 * source says when it leaves the platform (GLOSSARY.md, "Standing").
 */
export const ENDED_STANDS_FOR = 2 * 60_000

const EARTH_RADIUS = 6_371_000

/** The distance between two nearby points, in metres. Exact enough across a city. */
export function distance([lat1, lon1]: LatLon, [lat2, lon2]: LatLon): number {
  const rad = Math.PI / 180
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad)
  const y = (lat2 - lat1) * rad
  return Math.hypot(x, y) * EARTH_RADIUS
}

/**
 * Measures a pattern's path from its stop-to-stop segments, one per pair of stops in calling
 * order, each running from its stop to the next. Each stop sits at its segment's first point;
 * a gap between one segment's end and the next one's start is bridged.
 */
export function measurePath(segments: readonly (readonly LatLon[])[]): MeasuredPath {
  const points: LatLon[] = []
  const distances: number[] = []
  const stops: number[] = []
  for (const segment of segments) {
    segment.forEach((point, i) => {
      const last = points.at(-1)
      if (!last || last[0] !== point[0] || last[1] !== point[1]) {
        distances.push(last ? distances.at(-1)! + distance(last, point) : 0)
        points.push(point)
      }
      if (i === 0) stops.push(distances.at(-1)!)
    })
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
  // The first point at or past the distance, found by halving.
  let low = 1
  let high = distances.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (distances[middle] < along) low = middle + 1
    else high = middle
  }
  const share = (along - distances[low - 1]) / (distances[low] - distances[low - 1])
  const [lat1, lon1] = points[low - 1]
  const [lat2, lon2] = points[low]
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
 * the gaps the scheduled ones plus the latest delay before them. Calls before the first expected
 * time take `delay`, the trip's last known delay in seconds, else the first delay an update gave,
 * so a trip whose one known stop lies ahead runs late from where it is. No time runs back before
 * the one before it.
 */
export function timedCalls(calls: readonly Call[], delay?: number): TimedCall[] {
  const firstKnown = calls.map(delayAt).find((each) => each !== undefined)
  let carried = delay !== undefined ? delay * 1000 : (firstKnown ?? 0)
  let latest = -Infinity
  const atLeastLatest = (time: number) => (latest = Math.max(latest, time))
  return calls.map((call) => {
    const arrival = atLeastLatest(call.expectedArrival ?? call.arrival + carried)
    carried = delayAt(call) ?? carried
    const departure = atLeastLatest(call.expectedDeparture ?? call.departure + carried)
    return { arrival, departure }
  })
}

/**
 * One of a trip's delay steps (spec #146): a call its update gave an expected time, by its index,
 * and its delay there in seconds, late at its departure, or at its arrival at the last stop.
 * SIRI-ET's update table lists a journey's delays this way, only where the delay changes.
 */
export type DelayStep = readonly [index: number, delay: number]

/** The steps of an update's calls: each call with an expected time, and its delay there. */
export function delaySteps(calls: readonly Call[]): DelayStep[] {
  return calls.flatMap((call, index) => {
    const delay = delayAt(call)
    return delay === undefined ? [] : [[index, delay / 1000] as const]
  })
}

/**
 * The times a trip will keep at each of its scheduled `calls`, from what the snapshot carries of
 * it: by its delay steps where it has them, each step's call leaving that late (arriving so at the
 * last stop) and the calls between timed as `timedCalls` times an update's; else every call
 * shifted by its delay; none with neither.
 */
export function expectedTimes(
  calls: readonly Call[],
  { delay, steps }: { readonly delay?: number; readonly steps?: readonly DelayStep[] },
): TimedCall[] | undefined {
  if (steps && steps.length > 0) {
    const last = calls.length - 1
    const stepped: Call[] = calls.map(({ arrival, departure }) => ({ arrival, departure }))
    for (const [index, late] of steps) {
      const call = stepped[index]
      if (!call) continue
      stepped[index] = {
        ...call,
        expectedDeparture: call.departure + late * 1000,
        ...(index === last ? { expectedArrival: call.arrival + late * 1000 } : {}),
      }
    }
    return timedCalls(stepped)
  }
  return delay === undefined ? undefined : timedCalls(calls, delay)
}

/** Where a trip is in its day at a moment, from all its timed calls. */
export function tripPhase(calls: readonly TimedCall[], now: number): TripPhase {
  if (calls.length === 0) return 'finished'
  const first = calls[0].departure
  if (now < first - WAITING_FROM) return 'upcoming'
  if (now < first) return 'waiting'
  if (now < calls.at(-1)!.arrival) return 'underway'
  return 'finished'
}

/** A trip's timeline from its timed calls: at each stop from its arrival to its departure. */
export function timelineOf(calls: readonly TimedCall[], path: MeasuredPath): Timeline {
  if (calls.length !== path.stops.length) {
    throw new Error(
      `A trip with ${calls.length} calls can't run on a path of ${path.stops.length} stops`,
    )
  }
  return calls.flatMap((call, i) => [
    { time: call.arrival, progress: path.stops[i] },
    { time: call.departure, progress: path.stops[i] },
  ])
}

/**
 * A timeline that starts from a position an answer gave and carries it on to the calls ahead of
 * it in both time and distance, so a trip ahead of or behind its times moves on from where it
 * was seen and never runs back.
 */
export function timelineFrom(timeline: Timeline, position: Position): Timeline {
  return [
    position,
    ...timeline.filter(
      (point) => point.time > position.time && point.progress >= position.progress,
    ),
  ]
}

/**
 * A trip's progress at a moment on its timeline. Before the timeline it holds at the start;
 * between two points it moves at constant speed; past the last it carries on at its last speed,
 * and never beyond the pattern's end. That last rule serves the browser, whose timeline from a
 * snapshot ends at the trip's next few calls; a timeline of all its calls ends standing still.
 */
export function progressAt(timeline: Timeline, now: number, length: number): number {
  const first = timeline[0]
  if (!first) return 0
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
 * A trip as a vehicle at a moment, from all its timed calls: Waiting at its first stop or
 * underway between its calls, or undefined when it is not on the map, more than 5 minutes before
 * its first departure or once it has arrived at its last stop.
 */
export function tripAt(
  calls: readonly TimedCall[],
  path: MeasuredPath,
  now: number,
): Vehicle | undefined {
  const phase = tripPhase(calls, now)
  if (phase === 'upcoming' || phase === 'finished') return undefined
  const progress = progressAt(timelineOf(calls, path), now, path.length)
  return { phase, progress, point: pointAt(path, progress) }
}

/** Points this close to the path, in metres, count as on it when choosing between two stretches. */
const SNAP_TIE = 30

/**
 * The progress of a point snapped to the path: the nearest point along it. Where the path passes
 * near the point more than once, as a loop or an out-and-back does, the stretch nearer `hint`,
 * the timetable's guess at the trip's progress, wins.
 */
export function snapToPath(path: MeasuredPath, point: LatLon, hint: number): number {
  const { points, distances } = path
  if (points.length < 2) return 0
  const rad = Math.PI / 180
  const across = Math.cos(point[0] * rad) * rad * EARTH_RADIUS
  const up = rad * EARTH_RADIUS
  // Metres east and north of the point, on a plane through it.
  const local = ([lat, lon]: LatLon) => [(lon - point[1]) * across, (lat - point[0]) * up]
  const candidates: { off: number; along: number }[] = []
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = local(points[i - 1])
    const [bx, by] = local(points[i])
    const length = (bx - ax) ** 2 + (by - ay) ** 2
    const share =
      length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / length))
    candidates.push({
      off: Math.hypot(ax + share * (bx - ax), ay + share * (by - ay)),
      along: distances[i - 1] + share * (distances[i] - distances[i - 1]),
    })
  }
  const nearest = Math.min(...candidates.map(({ off }) => off))
  let best = candidates[0]
  for (const candidate of candidates) {
    if (candidate.off > nearest + SNAP_TIE) continue
    if (
      best.off > nearest + SNAP_TIE ||
      Math.abs(candidate.along - hint) < Math.abs(best.along - hint)
    ) {
      best = candidate
    }
  }
  return best.along
}
