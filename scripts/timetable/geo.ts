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
