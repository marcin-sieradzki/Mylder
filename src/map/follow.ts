// Follow, from vehicle detail (docs/screens.md, "Vehicle detail"): the camera stays on one trip's
// dot, moved from the animation loop each frame it draws, outside React, so the page renders
// again only when Follow starts or ends. It ends when the trip reaches its last stop or leaves
// the map, when the viewer pans, and when the trip's panel closes. A zoom keeps it: the camera
// zooms on the dot.
import 'client-only'
import type { Map as MapLibreMap, MapLibreEvent } from 'maplibre-gl'
import { useSyncExternalStore } from 'react'
import { mapView, type ViewStore } from './view.ts'
import type { Vehicles } from './vehicles.ts'

/** Where a moving dot was last placed along its path, and where the path's last stop lies. */
export interface Along {
  /** Metres along the path. */
  readonly progress: number
  /** The last stop's distance along the path, in metres. */
  readonly end: number
}

/** Where the camera goes for the followed dot this frame. */
export interface FollowTarget {
  /** The dot's longitude and latitude. */
  readonly centre: [number, number]
  /** Whether the dot stands at its trip's last stop, where Follow ends. */
  readonly arrived: boolean
}

/** A dot this close to its last stop, in metres, has reached it. */
const ARRIVED_WITHIN = 1

/**
 * Where the camera goes for the trip `key` in the dots as `drawn` this frame, from where its dot
 * stands and how far `along` its path it is, when it moves on one; none once it has left the map.
 */
export function followTarget(
  drawn: Pick<Vehicles, 'keys' | 'positions'>,
  key: string,
  along: Along | undefined,
): FollowTarget | undefined {
  const i = drawn.keys.indexOf(key)
  if (i < 0) return undefined
  return {
    centre: [drawn.positions[i * 2], drawn.positions[i * 2 + 1]],
    arrived: along !== undefined && along.progress >= along.end - ARRIVED_WITHIN,
  }
}

/** The input events a zoom by the viewer starts from, which keep Follow. */
const ZOOMS = new Set(['wheel', 'dblclick'])

/**
 * Whether a camera move ends Follow: one the viewer made by panning, with a mouse, a finger or the
 * arrow keys. MapLibre gives a move the viewer made its input event; the camera's own moves, and
 * Follow's, carry none. A zoom by the wheel, a double click or two fingers keeps Follow.
 */
export function endsFollow(move: { readonly originalEvent?: Event }): boolean {
  const input = move.originalEvent
  if (!input || ZOOMS.has(input.type)) return false
  const touches = (input as Partial<TouchEvent>).touches
  return !(touches && touches.length > 1)
}

export interface FollowStore {
  /** The followed trip's key; none while nothing is followed. */
  get(): string | undefined
  /** Follows the trip `key`, whose panel is open, until its panel closes or Follow ends. */
  start(key: string): void
  stop(): void
  /** Calls back whenever Follow starts or ends; returns the function that stops it. */
  subscribe(onChange: () => void): () => void
}

/** A store following nothing, which lets go of a trip when `view` no longer has its panel open. */
export function followStore(view: ViewStore = mapView): FollowStore {
  let followed: string | undefined
  let stopWatching: (() => void) | undefined
  const listeners = new Set<() => void>()
  const set = (to: string | undefined) => {
    if (to === followed) return
    followed = to
    for (const listener of listeners) listener()
  }
  const stop = () => {
    stopWatching?.()
    stopWatching = undefined
    set(undefined)
  }
  return {
    get: () => followed,
    start(key) {
      stopWatching?.()
      stopWatching = view.subscribe(() => {
        const { panel } = view.get()
        if (panel?.kind !== 'trip' || panel.id !== followed) stop()
      })
      set(key)
    },
    stop,
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
}

/** The page's one Follow, which vehicle detail starts and the canvas's camera keeps. */
export const followedVehicle = followStore()

/** The followed trip's key, for a component such as the Follow button. */
export function useFollowed(store: FollowStore = followedVehicle): string | undefined {
  return useSyncExternalStore(store.subscribe, store.get, () => undefined)
}

/** The part of MapLibre's map Follow moves. */
export type FollowMap = Pick<MapLibreMap, 'jumpTo' | 'isMoving' | 'scrollZoom' | 'on' | 'off'>

export interface FollowCamera {
  /**
   * Moves the camera onto the followed dot as the loop has just drawn it, `along` giving how far
   * along its path the dot of a trip is, when it moves on one.
   */
  frame(drawn: Vehicles, along: (key: string) => Along | undefined): void
  remove(): void
}

/**
 * Keeps `map`'s camera on the dot `store` follows, and ends Follow on the viewer's pan. While a
 * pointer is down on the map, in `container`, the camera holds still, since a move of the
 * camera's own would cancel the drag about to start; a drag that starts then ends Follow.
 */
export function followCamera(
  map: FollowMap,
  container: HTMLElement,
  store: FollowStore = followedVehicle,
): FollowCamera {
  const onMoveStart = (event: MapLibreEvent) => {
    if (store.get() !== undefined && endsFollow(event as { originalEvent?: Event })) store.stop()
  }
  map.on('movestart', onMoveStart)
  let held = false
  const hold = () => (held = true)
  const release = () => (held = false)
  container.addEventListener('pointerdown', hold)
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)
  // While following, the wheel zooms on the dot at the centre rather than on the pointer.
  const onFollow = () => {
    if (store.get() === undefined) map.scrollZoom.enable()
    else map.scrollZoom.enable({ around: 'center' })
  }
  const stopListening = store.subscribe(onFollow)
  return {
    frame(drawn, along) {
      const key = store.get()
      // A zoom under way carries on about the centre, where the dot is.
      if (key === undefined || held || map.isMoving()) return
      const target = followTarget(drawn, key, along(key))
      if (!target) return store.stop()
      map.jumpTo({ center: target.centre })
      if (target.arrived) store.stop()
    },
    remove() {
      map.off('movestart', onMoveStart)
      container.removeEventListener('pointerdown', hold)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      stopListening()
      if (store.get() !== undefined) store.stop()
    },
  }
}
