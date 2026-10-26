// Which dot the reader has picked, for its card (docs/screens.md, "The moving map"): a hover
// picks one for as long as the pointer rests on it, a tap or click pins it until a tap elsewhere
// or Esc. deck.gl picks on the GPU within `TAP_RADIUS` of the pointer, so every dot has a tap
// target of at least 24 px (ADR 0003). The card opens on its dot, not at the pointer, and its point
// follows the dot as the dot moves and the map pans.
import 'client-only'
import type { PickingInfo } from '@deck.gl/core'
import { useSyncExternalStore } from 'react'
import type { Vehicles } from './vehicles.ts'

/** How far from the pointer, in CSS pixels, a dot is picked: half the 24 px tap target. */
export const TAP_RADIUS = 12

/** The picked dot. */
export interface Picked {
  /** The trip's key. */
  readonly key: string
  /** Where the dot is on the page, in CSS pixels from the viewport's top left. */
  readonly point: readonly [number, number]
  /** Whether a tap pinned it, so that the pointer leaving it keeps the card open. */
  readonly pinned: boolean
}

export interface PickedStore {
  get(): Picked | undefined
  pick(picked: Picked): void
  clear(): void
  /** Calls back whenever the pick changes; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

/** A store with nothing picked. */
export function pickedStore(): PickedStore {
  let picked: Picked | undefined
  const listeners = new Set<() => void>()
  const set = (to: Picked | undefined) => {
    if (to === picked) return
    picked = to
    for (const listener of listeners) listener()
  }
  return {
    get: () => picked,
    pick: set,
    clear: () => set(undefined),
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}

/** The page's one pick, which the canvas sets and the card reads. */
export const pickedVehicle = pickedStore()

/** The picked dot, for a component such as the card. */
export function usePickedVehicle(store: PickedStore = pickedVehicle): Picked | undefined {
  return useSyncExternalStore(store.subscribe, store.get, () => undefined)
}

/** The deck.gl layer whose dots are picked, as `vehicleLayers` names it. */
export const PICKED_LAYER = 'vehicles'

export interface VehiclePicking {
  /** The overlay's props that pick: the radius and what a hover and a click do. */
  readonly props: {
    readonly pickingRadius: number
    onHover(info: PickingInfo): void
    onClick(info: PickingInfo): void
  }
  /**
   * Takes the vehicles as last drawn, and moves the picked dot's point to where `project` puts it
   * now. `project` turns a longitude and latitude into pixels from the canvas's top left.
   */
  follow(vehicles: Vehicles, project: Project): void
  /** Measures the canvas again on the page, after the map resized. */
  resized(): void
}

/** Turns a longitude and latitude into pixels from the canvas's top left. */
type Project = (lonLat: [number, number]) => { x: number; y: number }

/**
 * Picking for the dots drawn in `canvas`, the element deck.gl's pixels count from, into `store`.
 * `onPointer` hears whether the pointer rests on a dot, for its cursor.
 */
export function vehiclePicking(
  canvas: HTMLElement,
  store: PickedStore = pickedVehicle,
  onPointer: (onDot: boolean) => void = () => {},
): VehiclePicking {
  let vehicles: Vehicles | undefined
  let project: Project | undefined
  // Where the picked trip was found last, so a frame looks it up only when either changes.
  let found: { vehicles: Vehicles; key: string; index: number } | undefined
  const indexOf = (drawn: Vehicles, key: string) => {
    if (found?.vehicles !== drawn || found.key !== key)
      found = { vehicles: drawn, key, index: drawn.keys.indexOf(key) }
    return found.index
  }
  // The canvas's place on the page, measured once and again only when the map resizes, as the
  // map fills the window and never scrolls.
  let box: DOMRect | undefined
  const onPage = (x: number, y: number): [number, number] => {
    box ??= canvas.getBoundingClientRect()
    return [box.left + x, box.top + y]
  }
  /** Where the `i`th dot is on the page, or where the pointer is before anything is drawn. */
  const dotAt = (i: number, info: PickingInfo): [number, number] => {
    if (!vehicles || !project) return onPage(info.x, info.y)
    const { x, y } = project([vehicles.positions[i * 2], vehicles.positions[i * 2 + 1]])
    return onPage(x, y)
  }
  /** The trip a pick found, if it found one of the dots. */
  const keyOf = (info: PickingInfo) =>
    info.picked && info.layer?.id === PICKED_LAYER && info.index >= 0
      ? vehicles?.keys[info.index]
      : undefined

  return {
    props: {
      pickingRadius: TAP_RADIUS,
      onHover(info) {
        const key = keyOf(info)
        onPointer(key !== undefined)
        const now = store.get()
        if (now?.pinned) return
        if (key === undefined) store.clear()
        else if (key !== now?.key)
          store.pick({ key, point: dotAt(info.index, info), pinned: false })
      },
      onClick(info) {
        const key = keyOf(info)
        if (key === undefined) store.clear()
        else store.pick({ key, point: dotAt(info.index, info), pinned: true })
      },
    },
    follow(drawn, projection) {
      vehicles = drawn
      project = projection
      const picked = store.get()
      if (!picked) return
      const i = indexOf(drawn, picked.key)
      // The trip has left the map: arrived, cancelled, or no longer in the snapshot.
      if (i < 0) return store.clear()
      const { x, y } = projection([drawn.positions[i * 2], drawn.positions[i * 2 + 1]])
      const point = onPage(x, y)
      const moved = Math.hypot(point[0] - picked.point[0], point[1] - picked.point[1])
      if (moved >= 0.5) store.pick({ ...picked, point })
    },
    resized() {
      box = undefined
    },
  }
}
