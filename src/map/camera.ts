// The map's camera as the controls and the keys move it (docs/screens.md, "The moving map"): zoom
// in and out by a step, pan by a step, and reset to the view the map opened on, plus what the
// scale bar and the zoom buttons read back. The canvas attaches its MapLibre map; until it has,
// and where WebGL is missing, the controls have nothing to move.
import 'client-only'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useSyncExternalStore } from 'react'

/** What a view reads back for the controls. */
export interface CameraView {
  /** The ground distance one CSS pixel spans at the map's centre, in metres. */
  readonly metersPerPixel: number
  /** At the closest zoom, so zooming in does nothing. */
  readonly closest: boolean
  /** At the farthest zoom, so zooming out does nothing. */
  readonly farthest: boolean
}

/** The view the map opened on, which reset returns to. */
export interface Home {
  readonly center: [number, number]
  readonly zoom: number
}

/** The part of MapLibre's map the camera moves. */
export type CameraMap = Pick<
  MapLibreMap,
  | 'zoomIn'
  | 'zoomOut'
  | 'panBy'
  | 'easeTo'
  | 'getZoom'
  | 'getMinZoom'
  | 'getMaxZoom'
  | 'getCenter'
  | 'getContainer'
  | 'on'
  | 'off'
>

export interface Camera {
  /** Moves `map` from now on; `home` gives the view reset returns to. Returns the detach. */
  attach(map: CameraMap, home: () => Home): () => void
  /** The view now; none while no map is attached. */
  get(): CameraView | undefined
  subscribe(onChange: () => void): () => void
  zoomIn(): void
  zoomOut(): void
  /** Pans by a step in a direction: -1, 0 or 1 across, and down. */
  pan(across: -1 | 0 | 1, down: -1 | 0 | 1): void
  reset(): void
  /** Whether `element` is the map or inside it. */
  holds(element: Element): boolean
}

/** How far one press of an arrow key pans, in CSS pixels, as MapLibre's own keys do. */
export const PAN_STEP = 100

/** The Earth's circumference at the equator, in metres, as Web Mercator takes it. */
const EARTH = 40_075_016.686

/** MapLibre's tiles are 512 px wide, so the world is 512 × 2^zoom px across. */
export const metersPerPixelAt = (latitude: number, zoom: number): number =>
  (EARTH * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom)

/** A camera with no map yet. */
export function cameraStore(): Camera {
  let map: CameraMap | undefined
  let home: (() => Home) | undefined
  let view: CameraView | undefined
  const listeners = new Set<() => void>()

  const read = () => {
    if (!map) return undefined
    const zoom = map.getZoom()
    return {
      metersPerPixel: metersPerPixelAt(map.getCenter().lat, zoom),
      closest: zoom >= map.getMaxZoom(),
      farthest: zoom <= map.getMinZoom(),
    }
  }
  const update = () => {
    const next = read()
    const same =
      next?.metersPerPixel === view?.metersPerPixel &&
      next?.closest === view?.closest &&
      next?.farthest === view?.farthest
    if (same) return
    view = next
    for (const listener of listeners) listener()
  }

  return {
    attach(attached, opened) {
      map = attached
      home = opened
      attached.on('move', update)
      update()
      return () => {
        attached.off('move', update)
        if (map !== attached) return
        map = undefined
        home = undefined
        update()
      }
    },
    get: () => view,
    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    zoomIn: () => map?.zoomIn(),
    zoomOut: () => map?.zoomOut(),
    pan: (across, down) => map?.panBy([across * PAN_STEP, down * PAN_STEP]),
    reset() {
      if (map && home) map.easeTo(home())
    },
    holds: (element) => Boolean(map?.getContainer().contains(element)),
  }
}

/** The page's one camera, which the canvas attaches its map to. */
export const mapCamera = cameraStore()

/**
 * What `read` takes from the camera's view, for the controls or the scale bar: a component renders
 * again only when its own reading changes, so the zoom buttons sit still while the map pans and
 * the scale moves with the latitude.
 */
export function useCameraView<T>(
  read: (view: CameraView | undefined) => T,
  camera: Camera = mapCamera,
): T {
  return useSyncExternalStore(
    camera.subscribe,
    () => read(camera.get()),
    () => read(undefined),
  )
}
