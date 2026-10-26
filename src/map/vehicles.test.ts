import '@mylder/perron/tokens.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readNetwork, type Network } from '../timetable/network.ts'
import type { Snapshot } from '../tracker/index.ts'
import { readPaint } from './paint.ts'
import { vehiclePaint, vehiclesOf } from './vehicles.ts'

// The weekday recording's sixth minute, on its own timetable: 18 trips, one of them waiting.
const recording = join(process.cwd(), 'recordings', 'weekday')
const read = (path: string): unknown => JSON.parse(readFileSync(join(recording, path), 'utf8'))
const snapshot = read('snapshots/0006.json') as Snapshot
const files = (patterns = read(`timetable/${manifest().files.patterns}`)) => ({
  manifest: manifest(),
  stops: read(`timetable/${manifest().files.stops}`),
  patterns,
  paths: read(`timetable/${manifest().files.paths}`),
})
function manifest() {
  return read('timetable/manifest.json') as { files: Record<string, string> }
}
const network = readNetwork(files())

const root = document.documentElement
/** The vehicles drawn from a snapshot on a network, or on none (null) before it has loaded. */
const draw = (from: Snapshot = snapshot, on: Network | null = network) =>
  vehiclesOf(from, on ?? undefined, readPaint(root, vehiclePaint(on ?? undefined)))

const indexOf = (vehicles: ReturnType<typeof draw>, key: string) => {
  const index = vehicles.keys.indexOf(key)
  if (index < 0) throw new Error(`${key} is not drawn`)
  return index
}

const fillOf = (vehicles: ReturnType<typeof draw>, key: string) => {
  const i = indexOf(vehicles, key)
  return [...vehicles.fill.subarray(i * 4, i * 4 + 4)]
}

const lineOf = (vehicles: ReturnType<typeof draw>, key: string) => {
  const i = indexOf(vehicles, key)
  return [...vehicles.line.subarray(i * 4, i * 4 + 4)]
}

const A_LIVE = 's-tog.A.0bc307e3eb.20260616.0707'
const RE_LIVE = 'train.RE.7c3e865b99.20260616.0717'
const BUS_LIVE = 'bus.5C.a74214d87d.20260616.0714'
const WAITING = 'bus.991.7ce514fd98.20260616.0730'
const M1_TIMETABLE = 'metro.M1.7f21f99145.20260616.0703'

afterEach(() => {
  delete root.dataset.theme
})

describe('the vehicles on the map', () => {
  it('draws every trip in the snapshot, each at its position as longitude and latitude', () => {
    const vehicles = draw()
    expect(vehicles.length).toBe(18)
    expect(vehicles.keys).toEqual(snapshot.trips.map((trip) => trip.key))
    const i = indexOf(vehicles, A_LIVE)
    expect([...vehicles.positions.subarray(i * 2, i * 2 + 2)]).toEqual([12.5, 55.63996])
  })

  it('leaves a cancelled trip off the map', () => {
    const cancelled: Snapshot = {
      ...snapshot,
      trips: snapshot.trips.map((trip) =>
        trip.key === A_LIVE ? { ...trip, cancelled: true as const } : trip,
      ),
    }
    const vehicles = draw(cancelled)
    expect(vehicles.length).toBe(17)
    expect(vehicles.keys).not.toContain(A_LIVE)
    expect(vehicles.positions).toHaveLength(17 * 2)
  })

  it('draws a waiting trip at its first stop', () => {
    const vehicles = draw()
    const trip = snapshot.trips.find((each) => each.key === WAITING)!
    const firstStop = network.stops.platforms[network.patterns.patterns[trip.pattern].stops[0]]
    const i = indexOf(vehicles, WAITING)
    const [lon, lat] = vehicles.positions.subarray(i * 2, i * 2 + 2)
    expect(Math.abs(lon - firstStop.lon)).toBeLessThan(0.0005)
    expect(Math.abs(lat - firstStop.lat)).toBeLessThan(0.0005)
  })

  it("fills each dot in its line's colour, or its mode's, in its state's glyph", () => {
    const vehicles = draw()
    // A Live A train is solid in line A's colour; a Live RE in the regional mode's.
    expect(fillOf(vehicles, A_LIVE)).toEqual([0x00, 0xa1, 0xde, 255])
    expect(fillOf(vehicles, RE_LIVE)).toEqual([0x23, 0x2c, 0x31, 255])
    expect(fillOf(vehicles, BUS_LIVE)).toEqual([0xd9, 0x9a, 0x00, 255])
    // A Timetable only M1 train is a dashed ring in M1's green, with nothing inside.
    const m1 = indexOf(vehicles, M1_TIMETABLE)
    expect(lineOf(vehicles, M1_TIMETABLE)).toEqual([0x0b, 0x8a, 0x44, 255])
    expect(fillOf(vehicles, M1_TIMETABLE)[3]).toBe(0)
    expect(vehicles.dash[m1 * 2]).toBeGreaterThan(0)
    // And every dot stands on a land-coloured halo, a little wider than it.
    expect(vehicles.haloRadius[m1]).toBeCloseTo(4.6 + 1.6)
    expect(vehicles.haloColour).toEqual([0xed, 0xef, 0xeb, 255])
  })

  it("takes the mode's colour for a line Perron has no colour for", () => {
    const patterns = read(`timetable/${manifest().files.patterns}`) as {
      lines: { name: string; colour: string }[]
    }
    patterns.lines.find((line) => line.name === 'A')!.colour = 'perron-color-transit-line-z'
    expect(fillOf(draw(snapshot, readNetwork(files(patterns))), A_LIVE)).toEqual([
      0x23, 0x2c, 0x31, 255,
    ])
    // So does every line before the snapshot's timetable has loaded.
    expect(fillOf(draw(snapshot, null), A_LIVE)).toEqual([0x23, 0x2c, 0x31, 255])
    expect(fillOf(draw(snapshot, null), BUS_LIVE)).toEqual([0xd9, 0x9a, 0x00, 255])
  })

  it('draws each vehicle in the data state it has by the clock, where one is given', () => {
    // Four minutes on, A's report has aged: it is drawn Ageing, its fill no longer solid.
    const states = new Map([[A_LIVE, 'ageing' as const]])
    const vehicles = vehiclesOf(snapshot, network, readPaint(root, vehiclePaint(network)), states)
    expect(fillOf(vehicles, A_LIVE)[3]).toBeLessThan(255)
    expect(fillOf(vehicles, RE_LIVE)).toEqual([0x23, 0x2c, 0x31, 255])
  })

  it('repaints in the dark theme', () => {
    root.dataset.theme = 'dark'
    const vehicles = draw()
    expect(fillOf(vehicles, RE_LIVE)).toEqual([0xee, 0xf1, 0xf0, 255])
    expect(vehicles.haloColour).toEqual([0x15, 0x1b, 0x1e, 255])
  })
})
