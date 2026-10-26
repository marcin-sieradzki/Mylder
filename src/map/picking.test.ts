import '@mylder/perron/tokens.css'
import type { PickingInfo } from '@deck.gl/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../tracker/index.ts'
import { readPaint } from './paint.ts'
import { pickedStore, vehiclePicking } from './picking.ts'
import { vehicleLayers } from './VehicleGlyphLayer.ts'
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
const A_LIVE = 's-tog.A.0bc307e3eb.20260616.0707'
const BUS_LIVE = 'bus.5C.a74214d87d.20260616.0714'

/** The map's canvas, 100 px from the viewport's left and 50 px from its top. */
function canvas(): HTMLElement {
  const element = document.createElement('div')
  element.getBoundingClientRect = () => DOMRect.fromRect({ x: 100, y: 50, width: 800, height: 600 })
  return element
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

/** A picking whose vehicles have been drawn once, where they stand. */
function picking() {
  const store = pickedStore()
  const picks = vehiclePicking(canvas(), store)
  picks.follow(vehicles, () => ({ x: 0, y: 0 }))
  store.clear()
  return { store, picks }
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

  it('pins the card on the dot a tap found, at the tap on the page', () => {
    const { store, picks } = picking()
    picks.props.onClick(pointer(40, 30, A_LIVE))
    expect(store.get()).toEqual({ key: A_LIVE, point: [140, 80], pinned: true })
    // The pointer leaving the dot keeps a pinned card open.
    picks.props.onHover(pointer(400, 300))
    expect(store.get()?.key).toBe(A_LIVE)
    // A tap where deck.gl finds no dot closes it.
    picks.props.onClick(pointer(400, 300))
    expect(store.get()).toBeUndefined()
  })

  it('shows a card while the pointer rests on a dot, and none once it leaves', () => {
    const { store, picks } = picking()
    picks.props.onHover(pointer(10, 10, BUS_LIVE))
    expect(store.get()).toEqual({ key: BUS_LIVE, point: [110, 60], pinned: false })
    picks.props.onHover(pointer(12, 12, A_LIVE))
    expect(store.get()?.key).toBe(A_LIVE)
    picks.props.onHover(pointer(400, 300))
    expect(store.get()).toBeUndefined()
  })

  it('moves the card with its dot, and closes it when the trip leaves the map', () => {
    const { store, picks } = picking()
    picks.props.onClick(pointer(40, 30, A_LIVE))
    picks.follow(vehicles, () => ({ x: 60, y: 30 }))
    expect(store.get()?.point).toEqual([160, 80])
    const without = vehiclesOf(
      { ...snapshot, trips: snapshot.trips.filter((trip) => trip.key !== A_LIVE) },
      undefined,
      readPaint(document.documentElement, vehiclePaint()),
    )
    picks.follow(without, () => ({ x: 60, y: 30 }))
    expect(store.get()).toBeUndefined()
  })
})
