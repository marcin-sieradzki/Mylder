import '@mylder/perron/tokens.css'
import type { PickingInfo } from '@deck.gl/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../tracker/index.ts'
import { readPaint } from './paint.ts'
import type { AircraftSnapshot } from '../tracker/aircraft/index.ts'
import { aircraftDrawn, aircraftOf, aircraftPaint } from './AircraftGlyphLayer.ts'
import { dotPicking, pickedStore } from './picking.ts'
import { tripsDrawn, vehicleLayers } from './VehicleGlyphLayer.ts'
import { vehiclePaint, vehiclesOf } from './vehicles.ts'

// deck.gl picks on the GPU, which jsdom lacks: these tests hand the picking what deck.gl finds
// under a pointer, as it reports it, and check what the reader would then see picked.
const snapshot = JSON.parse(
  readFileSync(join(process.cwd(), 'recordings', 'weekday', 'snapshots', '0006.json'), 'utf8'),
) as Snapshot
const vehicles = vehiclesOf(
  snapshot,
  undefined,
  readPaint(document.documentElement, vehiclePaint()),
)
const aircraftSnapshot = JSON.parse(
  readFileSync(
    join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', '0001.json'),
    'utf8',
  ),
) as AircraftSnapshot
const aircraft = aircraftOf(aircraftSnapshot, readPaint(document.documentElement, aircraftPaint()))
/** Both kinds as the overlay draws them, the aircraft above the vehicles. */
const drawn = [tripsDrawn(vehicles), aircraftDrawn(aircraft)]
const A_LIVE = 's-tog.A.0bc307e3eb.20260616.0707'
const SAS = aircraftSnapshot.aircraft[0].hex
const BUS_LIVE = 'bus.5C.a74214d87d.20260616.0714'

/** The map's canvas, 100 px from the viewport's left and 50 px from its top, counting its measures. */
function canvas() {
  const element = document.createElement('div')
  const at = { x: 100, y: 50, measured: 0 }
  element.getBoundingClientRect = () => {
    at.measured++
    return DOMRect.fromRect({ x: at.x, y: at.y, width: 800, height: 600 })
  }
  return { element, at }
}

const layers = vehicleLayers(vehicles, 1)
const glyphs = layers.find((layer) => layer.id === 'vehicles')!

/** What deck.gl reports for a pointer at `x`, `y` on the canvas, over the dot of `key` or none. */
const pointer = (x: number, y: number, key?: string) =>
  ({
    x,
    y,
    picked: key !== undefined,
    index: key === undefined ? -1 : vehicles.keys.indexOf(key),
    layer: key === undefined ? null : glyphs,
  }) as unknown as PickingInfo

/** What deck.gl reports for a pointer over the aircraft `hex`. */
const overAircraft = (x: number, y: number, hex: string) =>
  ({
    x,
    y,
    picked: true,
    index: aircraftDrawn(aircraft).keys.indexOf(hex),
    layer: aircraftDrawn(aircraft)
      .layers(1)
      .find((layer) => layer.id === 'aircraft'),
  }) as unknown as PickingInfo

/** Every dot drawn 20 px from the canvas's left and 10 px from its top. */
const still = () => ({ x: 20, y: 10 })

/** A picking whose vehicles have been drawn once, standing still. */
function picking() {
  const store = pickedStore()
  const page = canvas()
  const picks = dotPicking(page.element, store)
  picks.follow(drawn, still)
  store.clear()
  return { store, picks, page }
}

describe('picking a dot', () => {
  it('picks any dot within 12 px of the pointer, so each has a 24 px tap target', () => {
    const { picks } = picking()
    expect(picks.props.pickingRadius).toBe(12)
    // Only the dots pick, never the halos under them.
    expect(glyphs.props.pickable).toBe(true)
    expect(layers.filter((layer) => layer.props.pickable).map((layer) => layer.id)).toEqual([
      'vehicles',
    ])
  })

  it('hands on a tap on a dot, for its detail, and closes the hover card', () => {
    const store = pickedStore()
    const tapped: string[] = []
    const picks = dotPicking(canvas().element, store, { onTap: (_, key) => tapped.push(key) })
    picks.follow(drawn, still)
    picks.props.onHover(pointer(30, 18, A_LIVE))
    expect(store.get()?.key).toBe(A_LIVE)
    // Up to 12 px from the dot.
    picks.props.onClick(pointer(30, 18, A_LIVE))
    expect(tapped).toEqual([A_LIVE])
    expect(store.get()).toBeUndefined()
    // A tap where deck.gl finds no dot opens nothing.
    picks.props.onClick(pointer(400, 300))
    expect(tapped).toEqual([A_LIVE])
  })

  it('hands on a tap that finds no dot, for the stop under it; a dot wins over a stop', () => {
    const store = pickedStore()
    const missed: [number, number][] = []
    const picks = dotPicking(canvas().element, store, {
      onMiss: (x, y) => missed.push([x, y]),
    })
    picks.follow(drawn, still)
    picks.props.onClick(pointer(30, 18, A_LIVE))
    expect(missed).toEqual([])
    picks.props.onClick(pointer(400, 300))
    expect(missed).toEqual([[400, 300]])
  })

  it('shows a card while the pointer rests on a dot, and none once it leaves', () => {
    const { store, picks } = picking()
    picks.props.onHover(pointer(10, 4, BUS_LIVE))
    expect(store.get()).toEqual({ kind: 'trip', key: BUS_LIVE, point: [120, 60] })
    picks.props.onHover(pointer(12, 12, A_LIVE))
    expect(store.get()?.key).toBe(A_LIVE)
    picks.props.onHover(pointer(400, 300))
    expect(store.get()).toBeUndefined()
  })

  it('moves the card with its dot, and closes it when the trip leaves the map', () => {
    const { store, picks } = picking()
    picks.props.onHover(pointer(40, 30, A_LIVE))
    picks.follow(drawn, () => ({ x: 60, y: 30 }))
    expect(store.get()?.point).toEqual([160, 80])
    const without = vehiclesOf(
      { ...snapshot, trips: snapshot.trips.filter((trip) => trip.key !== A_LIVE) },
      undefined,
      readPaint(document.documentElement, vehiclePaint()),
    )
    picks.follow([tripsDrawn(without), aircraftDrawn(aircraft)], () => ({ x: 60, y: 30 }))
    expect(store.get()).toBeUndefined()
  })

  it('measures the canvas once rather than each frame, and again when the map resizes', () => {
    const { store, picks, page } = picking()
    picks.props.onHover(pointer(20, 10, A_LIVE))
    for (let x = 21; x < 30; x++) picks.follow(drawn, () => ({ x, y: 10 }))
    expect(store.get()?.point).toEqual([129, 60])
    expect(page.at.measured).toBe(1)
    // The window narrowed: the canvas now starts at the viewport's left.
    page.at.x = 0
    picks.resized()
    picks.follow(drawn, () => ({ x: 29, y: 10 }))
    expect(store.get()?.point).toEqual([29, 60])
  })
})

describe('picking an aircraft', () => {
  it('picks the aircraft by its hex, with its kind, so no vehicle card opens on it', () => {
    const { store, picks } = picking()
    picks.props.onHover(overAircraft(14, 6, SAS))
    expect(store.get()).toEqual({ kind: 'aircraft', key: SAS, point: [120, 60] })
    // A vehicle at the same index is another dot.
    picks.props.onHover(pointer(14, 6, vehicles.keys[0]))
    expect(store.get()?.kind).toBe('trip')
  })

  it('hands on a tap on an aircraft by its kind, never as a trip, and never as a miss', () => {
    const store = pickedStore()
    const tapped: [string, string][] = []
    const missed: [number, number][] = []
    const picks = dotPicking(canvas().element, store, {
      onTap: (kind, key) => tapped.push([kind, key]),
      onMiss: (x, y) => missed.push([x, y]),
    })
    picks.follow(drawn, still)
    picks.props.onClick(overAircraft(14, 6, SAS))
    expect(tapped).toEqual([['aircraft', SAS]])
    expect(missed).toEqual([])
  })

  it('makes only the aircraft dots pickable, never their halos or ticks', () => {
    const drawnLayers = aircraftDrawn(aircraft).layers(1)
    expect(drawnLayers.map((layer) => layer.id)).toEqual([
      'aircraft-halos',
      'aircraft-ticks',
      'aircraft',
    ])
    expect(drawnLayers.filter((layer) => layer.props.pickable).map((layer) => layer.id)).toEqual([
      'aircraft',
    ])
  })
})
