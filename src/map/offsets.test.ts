import '@mylder/perron/tokens.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pointAt } from '../domain/trip-motion.ts'
import { readNetwork } from '../timetable/network.ts'
import type { Snapshot } from '../tracker/index.ts'
import { stubProjection, worldOf, type StubCamera } from '../test/projection.ts'
import { writeOffset } from './offsets.ts'
import { readPaint } from './paint.ts'
import { dotPicking, pickedStore } from './picking.ts'
import { tripsDrawn, vehicleLayers } from './VehicleGlyphLayer.ts'
import { vehiclePaint, vehiclesOf } from './vehicles.ts'

// Where a dot on its line's strand is drawn, with the map's camera stood in for: MapLibre draws
// each strand on the ground, its `line-offset` in px at the camera's zoom, so a dot on the strand
// is drawn on it however the map is turned or tilted.
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
const vehicles = vehiclesOf(
  minute6,
  network,
  readPaint(document.documentElement, vehiclePaint(network)),
)

// An E and an A train, each at places on its path where A and E share a track, half an S-tog
// track spacing (1.4 px) off its centre.
const E_SOUTH = 's-tog.E.e8dc141a28.20260616.0702'
const A_NORTH = 's-tog.A.0bc307e3eb.20260616.0707'

/** Stands the dot of `key` at `along` metres along its path, its offset written by `projection`. */
function standAt(key: string, along: number, projection: ReturnType<typeof stubProjection>) {
  const i = vehicles.keys.indexOf(key)
  const path = network.pathOf(vehicles.trips[i].pattern)
  const [lat, lon] = pointAt(path, along)
  vehicles.positions.set([lon, lat], i * 2)
  writeOffset(vehicles, i, path, along, projection)
  return { i, path, offset: [...vehicles.offsets.subarray(i * 2, i * 2 + 2)] }
}

/**
 * The strand under the dot of `key` at `along` metres, as MapLibre draws it: the piece of path
 * the dot is on, moved its strand's px to the right of its way in the world at the camera's zoom,
 * then drawn by the camera; and the dot as the canvas draws it.
 */
function strandAndDot(key: string, along: number, turn: Partial<StubCamera>) {
  const path = network.pathOf(vehicles.trips[vehicles.keys.indexOf(key)].pattern)
  const [lat, lon] = pointAt(path, along)
  // The camera on a point a little south of the dot, so a tilt draws the dot up the canvas.
  const camera = { centre: [lon, lat - 0.002], zoom: 14, ...turn } as const
  const projection = stubProjection(camera)
  const { i } = standAt(key, along, projection)
  const piece = path.distances.findIndex((distance) => distance > along)
  const step = path.stops.findLastIndex((stop) => stop <= along)
  const place = vehicles.strands[i]![step]
  const [from, to] = [path.points[piece - 1], path.points[piece]].map(([pointLat, pointLon]) =>
    worldOf([pointLon, pointLat], camera.zoom),
  )
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
  const length = Math.hypot(dx, dy)
  // Facing (dx, dy) in the world, whose y runs south, the right is (−dy, dx).
  const moved = (point: [number, number]) =>
    projection.projectWorld([point[0] - (place * dy) / length, point[1] + (place * dx) / length])
  const centre = (point: [number, number]) => projection.projectWorld(point)
  return {
    strand: [moved(from), moved(to)],
    centreLine: [centre(from), centre(to)],
    dot: tripsDrawn(vehicles).at(i, projection.project),
  }
}

/** How far `point` is from the line through `a` and `b`, in px. */
function awayFrom([x, y]: [number, number], [a, b]: { x: number; y: number }[]) {
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  return Math.abs((x - a.x) * dy - (y - a.y) * dx) / Math.hypot(dx, dy)
}

describe("a dot on its line's strand", () => {
  it('sits where it always has on a flat map facing north, in px east and north', () => {
    // Today's offsets, as the dots rode their strands before the map could turn.
    const flat = stubProjection({ centre: [12.57, 55.68], zoom: 14 })
    const cases = [
      [E_SOUTH, 14443, [-1.3616702556610107, -0.32535216212272644]],
      [A_NORTH, 12550, [1.161948561668396, -0.7809451818466187]],
      [A_NORTH, 27653.79, [1.069651484489441, 0.9032416939735413]],
    ] as const
    // Worked out directly, as the loop does each frame while the map is flat and north-up, or
    // through the camera, as it does once the map turns, the offset is the same.
    const projected = { ...flat, flatNorthUp: false }
    for (const projection of [flat, projected]) {
      for (const [key, along, [east, north]] of cases) {
        const { offset } = standAt(key, along, projection)
        expect(offset[0]).toBeCloseTo(east, 4)
        expect(offset[1]).toBeCloseTo(north, 4)
      }
    }
  })

  it.each([
    ['flat, facing north', {}],
    ['flat, turned to face east', { bearing: 90 }],
    ['turned to face south-west', { bearing: -135 }],
    ['tilted 45°', { pitch: 45 }],
    ['tilted 45° and turned to face east', { pitch: 45, bearing: 90 }],
  ])('is drawn on the strand MapLibre draws there, %s', (_, turn) => {
    for (const [key, along] of [
      [E_SOUTH, 14443],
      [A_NORTH, 12550],
      [A_NORTH, 27653.79],
    ] as const) {
      const { strand, centreLine, dot } = strandAndDot(key, along, turn)
      expect(awayFrom(dot, strand)).toBeLessThan(0.001)
      // Off the track's centre by about the strand's 1.4 px, the rest of the way foreshortened.
      expect(awayFrom(dot, centreLine)).toBeGreaterThan(0.7)
    }
  })
})

describe('picking a dot on its strand', () => {
  it('opens its card on the dot where the canvas draws it, on a map turned to face east', () => {
    const turned = stubProjection({ centre: [12.59, 55.7], zoom: 14, bearing: 90 })
    const { i } = standAt(E_SOUTH, 14443, turned)
    const store = pickedStore()
    const canvas = document.createElement('div')
    canvas.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 })
    const picks = dotPicking(canvas, store)
    picks.follow([tripsDrawn(vehicles)], turned.project)
    const glyphs = vehicleLayers(vehicles, 1).find((layer) => layer.props.pickable)
    picks.props.onHover({ x: 0, y: 0, picked: true, index: i, layer: glyphs } as never)
    // Facing north the dot sits 1.36 px west of its position and 0.33 px south; facing east, the
    // ground's west is down the canvas and its south to the right.
    const { x, y } = turned.project([vehicles.positions[i * 2], vehicles.positions[i * 2 + 1]])
    const [px, py] = store.get()!.point
    expect(store.get()?.key).toBe(E_SOUTH)
    expect(px - x).toBeCloseTo(0.3254, 3)
    expect(py - y).toBeCloseTo(1.3617, 3)
  })

  it('opens its card on its strand, and its detail on a tap, on a map tilted and turned', () => {
    const tilted = { pitch: 45, bearing: -135 }
    for (const [key, along] of [
      [E_SOUTH, 14443],
      [A_NORTH, 27653.79],
    ] as const) {
      const { strand } = strandAndDot(key, along, tilted)
      const i = vehicles.keys.indexOf(key)
      const [lon, lat] = vehicles.positions.subarray(i * 2, i * 2 + 2)
      const projection = stubProjection({ centre: [lon, lat - 0.002], zoom: 14, ...tilted })
      const store = pickedStore()
      const tapped: string[] = []
      const canvas = document.createElement('div')
      canvas.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 })
      const picks = dotPicking(canvas, store, { onTap: (_, tappedKey) => tapped.push(tappedKey) })
      picks.follow([tripsDrawn(vehicles)], projection.project)
      const glyphs = vehicleLayers(vehicles, 1).find((layer) => layer.props.pickable)
      const pick = { x: 0, y: 0, picked: true, index: i, layer: glyphs } as never
      picks.props.onHover(pick)
      expect(store.get()?.key).toBe(key)
      expect(awayFrom([...store.get()!.point], strand)).toBeLessThan(0.001)
      picks.props.onClick(pick)
      expect(tapped).toEqual([key])
    }
  })
})
