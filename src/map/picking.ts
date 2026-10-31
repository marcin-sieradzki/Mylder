// Which dot the reader has picked, for its card (docs/screens.md, "The moving map"): a hover
// picks one for as long as the pointer rests on it, and a tap or click on one hands it on to open
// its detail, closing the card. A pick carries its kind, a trip or an aircraft, so each kind's
// card and detail open for its own dots only. deck.gl picks on the GPU within `TAP_RADIUS` of the pointer, so
// every dot has a tap target of at least 24 px (ADR 0003). The card opens on its dot, not at the
// pointer, and its point follows the dot as the dot moves and the map pans.
import 'client-only'
import type { Layer, PickingInfo } from '@deck.gl/core'
import { useSyncExternalStore } from 'react'

/** How far from the pointer, in CSS pixels, a dot is picked: half the 24 px tap target. */
export const TAP_RADIUS = 12

/** The kinds of thing the overlay draws that a pick can find. */
export type PickedKind = 'trip' | 'aircraft'

/** The picked dot. */
export interface Picked {
  readonly kind: PickedKind
  /** The trip's key, or the aircraft's hex. */
  readonly key: string
  /** Where the dot is on the page, in CSS pixels from the viewport's top left. */
  readonly point: readonly [number, number]
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

/** Turns a longitude and latitude into pixels from the canvas's top left. */
export type Project = (lonLat: [number, number]) => { x: number; y: number }

/**
 * One kind of thing the overlay draws (overlay.ts): its deck.gl layers, the one of them whose
 * dots a pick finds, what each dot is by its index there, and where it is drawn.
 */
export interface DrawnKind {
  readonly kind: PickedKind
  /** What each dot is, in drawing order: a trip's key, an aircraft's hex. */
  readonly keys: readonly string[]
  /** The id of the layer whose dots pick, drawn in the same order as `keys`. */
  readonly picks: string
  /** Where the `i`th dot is drawn in the canvas, by where `project` puts a point now. */
  at(i: number, project: Project): [number, number]
  /**
   * The layers that draw it, each dot `radiusScale` times Perron's size, on a map turned to
   * `heading`, the compass direction up the canvas, clockwise from north in degrees.
   */
  layers(radiusScale: number, heading: number): Layer[]
}

export interface DotPicking {
  /** The overlay's props that pick: the radius and what a hover and a click do. */
  readonly props: {
    readonly pickingRadius: number
    onHover(info: PickingInfo): void
    onClick(info: PickingInfo): void
  }
  /**
   * Takes the kinds as last drawn, and moves the picked dot's point to where `project` puts it
   * now. `project` turns a longitude and latitude into pixels from the canvas's top left.
   */
  follow(drawn: readonly DrawnKind[], project: Project): void
  /** Measures the canvas again on the page, after the map resized. */
  resized(): void
}

export interface PickingListeners {
  /** Hears a tap on a dot, by its kind and key, so that its detail can open. */
  readonly onTap?: (kind: PickedKind, key: string) => void
  /**
   * Hears what kind of dot the pointer rests on, if any, and where it rests, at its pixels from
   * the canvas's top left, for its cursor: off a dot, a stop under it takes one too.
   */
  readonly onPointer?: (on: PickedKind | undefined, x: number, y: number) => void
  /**
   * Hears a tap that found no dot, at its pixels from the canvas's top left, so that a stop under
   * it can open: a dot wins over a stop.
   */
  readonly onMiss?: (x: number, y: number) => void
}

/**
 * Picking for the dots of every kind drawn in `canvas`, the element deck.gl's pixels count from,
 * into `store`.
 */
export function dotPicking(
  canvas: HTMLElement,
  store: PickedStore = pickedVehicle,
  { onTap = () => {}, onPointer = () => {}, onMiss = () => {} }: PickingListeners = {},
): DotPicking {
  let kinds: readonly DrawnKind[] = []
  let project: Project | undefined
  // Where the picked dot was found last, so a frame looks it up only when either changes.
  let found: { keys: readonly string[]; key: string; index: number } | undefined
  const indexOf = (drawn: DrawnKind, key: string) => {
    if (found?.keys !== drawn.keys || found.key !== key)
      found = { keys: drawn.keys, key, index: drawn.keys.indexOf(key) }
    return found.index
  }
  // The canvas's place on the page, measured once and again only when the map resizes, as the
  // map fills the window and never scrolls.
  let box: DOMRect | undefined
  const onPage = (x: number, y: number): [number, number] => {
    box ??= canvas.getBoundingClientRect()
    return [box.left + x, box.top + y]
  }
  /** The kind and key of the dot a pick found, if it found one. */
  const pickOf = (info: PickingInfo) => {
    if (!info.picked || info.index < 0) return undefined
    const drawn = kinds.find((each) => each.picks === info.layer?.id)
    const key = drawn?.keys[info.index]
    return drawn && key !== undefined ? { drawn, key } : undefined
  }
  /** Where a picked dot is on the page, or where the pointer is before anything is drawn. */
  const dotAt = (drawn: DrawnKind, i: number, info: PickingInfo): [number, number] =>
    project ? onPage(...drawn.at(i, project)) : onPage(info.x, info.y)

  return {
    props: {
      pickingRadius: TAP_RADIUS,
      onHover(info) {
        const hit = pickOf(info)
        onPointer(hit?.drawn.kind, info.x, info.y)
        if (!hit) return store.clear()
        const picked = store.get()
        if (hit.key === picked?.key && hit.drawn.kind === picked.kind) return
        store.pick({
          kind: hit.drawn.kind,
          key: hit.key,
          point: dotAt(hit.drawn, info.index, info),
        })
      },
      onClick(info) {
        const hit = pickOf(info)
        store.clear()
        if (hit) onTap(hit.drawn.kind, hit.key)
        else onMiss(info.x, info.y)
      },
    },
    follow(drawn, projection) {
      kinds = drawn
      project = projection
      const picked = store.get()
      if (!picked) return
      const of = drawn.find((each) => each.kind === picked.kind)
      const i = of ? indexOf(of, picked.key) : -1
      // The dot has left the map: arrived, cancelled, or no longer in its snapshot.
      if (!of || i < 0) return store.clear()
      const point = onPage(...of.at(i, projection))
      const moved = Math.hypot(point[0] - picked.point[0], point[1] - picked.point[1])
      if (moved >= 0.5) store.pick({ ...picked, point })
    },
    resized() {
      box = undefined
    },
  }
}
