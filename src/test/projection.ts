// A stand-in for MapLibre's camera, for the map's tests, which jsdom can't run WebGL for: it
// draws the ground as MapLibre does, in its Web Mercator world of 512 px at zoom 0, turned to a
// heading and tilted by a pinhole camera, onto an 800 by 600 px canvas.
import type { Projection } from '../map/offsets.ts'

export interface StubCamera {
  /** The longitude and latitude at the canvas's centre. */
  readonly centre: readonly [number, number]
  readonly zoom: number
  /** The compass heading up the canvas, clockwise from north, in degrees. */
  readonly bearing?: number
  /** The tilt from looking straight down, in degrees. */
  readonly pitch?: number
}

/** The canvas the stub draws onto, in px. */
export const CANVAS = { width: 800, height: 600 } as const
const WIDTH = CANVAS.width
const HEIGHT = CANVAS.height
/** The camera's distance from the centre in px, as MapLibre's default field of view puts it. */
const DISTANCE = 1.5 * HEIGHT

/** A longitude and latitude in MapLibre's world at `zoom`, in px east and south of its corner. */
export function worldOf([lon, lat]: readonly [number, number], zoom: number): [number, number] {
  const size = 512 * 2 ** zoom
  const phi = (lat * Math.PI) / 180
  return [
    ((lon + 180) / 360) * size,
    (0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI)) * size,
  ]
}

/** The longitude and latitude of a point in MapLibre's world at `zoom`, the inverse of `worldOf`. */
export function lonLatOf([x, y]: readonly [number, number], zoom: number): [number, number] {
  const size = 512 * 2 ** zoom
  const mercator = (0.5 - y / size) * 2 * Math.PI
  return [
    (x / size) * 360 - 180,
    (2 * Math.atan(Math.exp(mercator)) - Math.PI / 2) * (180 / Math.PI),
  ]
}

export interface StubProjection extends Projection {
  /** Where a point of the world at the camera's zoom is drawn, in px from the canvas's top left. */
  projectWorld(world: readonly [number, number]): { x: number; y: number }
  /** The longitude and latitude of the ground drawn at a point of the canvas. */
  unproject(point: { readonly x: number; readonly y: number }): [number, number]
}

/** The camera `camera` as the map's projection. */
export function stubProjection({
  centre,
  zoom,
  bearing = 0,
  pitch = 0,
}: StubCamera): StubProjection {
  const [cx, cy] = worldOf(centre, zoom)
  const b = (bearing * Math.PI) / 180
  const p = (pitch * Math.PI) / 180
  const projectWorld = ([x, y]: readonly [number, number]) => {
    const east = x - cx
    const north = cy - y
    // Turned: across the canvas to the right, and up it, on the ground.
    const right = east * Math.cos(b) - north * Math.sin(b)
    const up = east * Math.sin(b) + north * Math.cos(b)
    // Tilted: the ground further up the canvas is further from the camera.
    const depth = DISTANCE + up * Math.sin(p)
    return {
      x: WIDTH / 2 + (right * DISTANCE) / depth,
      y: HEIGHT / 2 - (up * Math.cos(p) * DISTANCE) / depth,
    }
  }
  const unproject = ({ x, y }: { readonly x: number; readonly y: number }) => {
    const across = x - WIDTH / 2
    const above = HEIGHT / 2 - y
    // Back along the ray: the ground up the canvas, then across it at that depth.
    const up = (above * DISTANCE) / (DISTANCE * Math.cos(p) - above * Math.sin(p))
    const right = (across * (DISTANCE + up * Math.sin(p))) / DISTANCE
    const east = right * Math.cos(b) + up * Math.sin(b)
    const north = -right * Math.sin(b) + up * Math.cos(b)
    return lonLatOf([cx + east, cy - north], zoom)
  }
  return {
    zoom,
    flatNorthUp: bearing === 0 && pitch === 0,
    projectWorld,
    project: (lonLat) => projectWorld(worldOf(lonLat, zoom)),
    unproject,
  }
}
