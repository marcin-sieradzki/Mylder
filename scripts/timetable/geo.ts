// Plane geometry at city scale: an equirectangular projection around Copenhagen's latitude is
// within a fraction of a percent over the box, which is all a 5 m tolerance needs.

const EARTH = 6_371_008.8
const RAD = Math.PI / 180
const COS_LAT = Math.cos(55.75 * RAD)

/** A point in metres east and north of (0°, 0°), scaled for Copenhagen's latitude. */
export interface XY {
  readonly x: number
  readonly y: number
}

export function toXY(lat: number, lon: number): XY {
  return { x: lon * RAD * EARTH * COS_LAT, y: lat * RAD * EARTH }
}

export function distance(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function metresBetween(latA: number, lonA: number, latB: number, lonB: number): number {
  return distance(toXY(latA, lonA), toXY(latB, lonB))
}

export function fromXY({ x, y }: XY): readonly [lat: number, lon: number] {
  return [y / RAD / EARTH, x / RAD / EARTH / COS_LAT]
}

/** The nearest point to `p` on the line from `a` to `b`, and how far along it is (0 to 1). */
export function nearestOnSegment(p: XY, a: XY, b: XY): { point: XY; t: number; distance: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length2 = dx * dx + dy * dy
  const t =
    length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2))
  const point = { x: a.x + t * dx, y: a.y + t * dy }
  return { point, t, distance: distance(p, point) }
}

export function distanceToLine(p: XY, line: readonly XY[]): number {
  if (line.length === 1) return distance(p, line[0])
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    best = Math.min(best, nearestOnSegment(p, line[i - 1], line[i]).distance)
  }
  return best
}

/** Douglas-Peucker: drops points while the line stays within `tolerance` metres of them. */
export function simplify(points: readonly XY[], tolerance: number): XY[] {
  if (points.length <= 2) return [...points]
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let worst = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = nearestOnSegment(points[i], points[first], points[last]).distance
      if (d > worst) {
        worst = d
        index = i
      }
    }
    if (index >= 0 && worst > tolerance) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, i) => keep[i])
}

export interface Cut {
  /** The shape's leg the stop meets, from point `leg` to point `leg + 1`. */
  readonly leg: number
  readonly t: number
  readonly point: XY
}

/**
 * Where each stop, in calling order, meets the shape. Each stop takes the point that keeps the
 * stops in order along the shape with the least total distance, so a line that passes a stop
 * twice, such as a loop, cuts it where the trip calls.
 */
export function cutAtStops(shape: readonly XY[], stops: readonly XY[]): Cut[] {
  const legs = shape.length - 1
  if (legs < 1) throw new Error('a shape needs two points to cut')
  const near = stops.map((stop) =>
    Array.from({ length: legs }, (_, leg) => nearestOnSegment(stop, shape[leg], shape[leg + 1])),
  )
  // cost[leg]: the least total distance with this stop on `leg`; from[i][leg]: the previous
  // stop's leg on that best line.
  let cost = Float64Array.from(near[0], (n) => n.distance)
  const from: Int32Array[] = []
  for (let i = 1; i < stops.length; i++) {
    const next = new Float64Array(legs)
    const back = new Int32Array(legs)
    let bestCost = Infinity
    let bestLeg = 0
    for (let leg = 0; leg < legs; leg++) {
      if (cost[leg] < bestCost) {
        bestCost = cost[leg]
        bestLeg = leg
      }
      next[leg] = bestCost + near[i][leg].distance
      back[leg] = bestLeg
    }
    from.push(back)
    cost = next
  }
  let last = cost.indexOf(Math.min(...cost))
  const legsOf = new Array<number>(stops.length)
  for (let i = stops.length - 1; i >= 0; i--) {
    legsOf[i] = last
    if (i > 0) last = from[i - 1][last]
  }
  let previous: Cut | undefined
  return legsOf.map((leg, i) => {
    let { t, point } = near[i][leg]
    // Two stops on one leg keep their order along it.
    if (previous && previous.leg === leg && t < previous.t) ({ t, point } = previous)
    previous = { leg, t, point }
    return previous
  })
}
