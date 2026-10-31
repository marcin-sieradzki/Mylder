// The map's camera as the controls and the keys move it (docs/screens.md, "The moving map" and
// "The 3D view"): zoom in and out by a step, pan, tilt and turn by a step, and reset to the view
// the map opened on, flat and north-up, plus what the scale bar and the zoom buttons read back:
// the zoom, the tilt and the heading. Each move eases, or jumps when the system asks for reduced
// motion. The canvas attaches its MapLibre map; until it has, and where WebGL is missing, the
// controls have nothing to move.
import 'client-only'
import type { CameraOptions, Map as MapLibreMap } from 'maplibre-gl'
import { useSyncExternalStore } from 'react'

/** What a view reads back for the controls. */
export interface CameraView {
  /** The ground distance one CSS pixel spans at the map's centre, in metres. */
  readonly metersPerPixel: number
  /** At the closest zoom, so zooming in does nothing. */
  readonly closest: boolean
  /** At the farthest zoom, so zooming out does nothing. */
  readonly farthest: boolean
  /** The tilt from looking straight down, in degrees: 0 while the map is flat. */
  readonly pitch: number
  /** The compass heading up the canvas, clockwise from north in degrees, -180 to 180. */
  readonly bearing: number
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
  | 'jumpTo'
  | 'getZoom'
  | 'getMinZoom'
  | 'getMaxZoom'
  | 'getMaxPitch'
  | 'getCenter'
  | 'getPitch'
  | 'getBearing'
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
  /**
   * Pans by a step in a direction: -1, 0 or 1 across, and down. `input` is the viewer's key press
   * it answers, which the move carries, as MapLibre's own moves carry theirs, so Follow ends.
   */
  pan(across: -1 | 0 | 1, down: -1 | 0 | 1, input?: Event): void
  /** Tilts by a step, 1 further from looking straight down or -1 back, from flat to the most. */
  tilt(by: -1 | 1, input?: Event): void
  /** Turns by a step, 1 clockwise or -1 anticlockwise, carrying `input` as `pan` does. */
  turn(by: -1 | 1, input?: Event): void
  /** Returns to the view the map opened on, flat and north-up. */
  reset(): void
  /** Whether `element` is the map or inside it. */
  holds(element: Element): boolean
}

/** How far one press of an arrow key pans, in CSS pixels, as MapLibre's own keys do. */
export const PAN_STEP = 100

/** How far one tilt or turn by a key moves the map, in degrees, as MapLibre's own keys do. */
export const TILT_STEP = 10
export const TURN_STEP = 15

/** How long a tilt or turn by a key eases for, in ms, as MapLibre's own keys do. */
const STEP_EASE = 300

/** Whether the system asks for reduced motion; not where the browser has no media queries. */
const systemReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** The Earth's circumference at the equator, in metres, as Web Mercator takes it. */
const EARTH = 40_075_016.686

/** MapLibre's tiles are 512 px wide, so the world is 512 × 2^zoom px across. */
export const metersPerPixelAt = (latitude: number, zoom: number): number =>
  (EARTH * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom)

/**
 * A camera with no map yet. Its moves ease, unless `reducedMotion` says the system asks for
 * reduced motion, when they jump.
 */
export function cameraStore(reducedMotion: () => boolean = systemReducedMotion): Camera {
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
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    }
  }
  const update = () => {
    const next = read()
    const same =
      next?.metersPerPixel === view?.metersPerPixel &&
      next?.closest === view?.closest &&
      next?.farthest === view?.farthest &&
      next?.pitch === view?.pitch &&
      next?.bearing === view?.bearing
    if (same) return
    view = next
    for (const listener of listeners) listener()
  }

  /** Moves the attached map to `target`, carrying the viewer's `input` as MapLibre's moves do. */
  const move = (target: CameraOptions, input: Event | undefined, duration?: number) => {
    if (!map) return
    const eventData = input ? { originalEvent: input } : undefined
    if (reducedMotion()) map.jumpTo(target, eventData)
    else map.easeTo({ ...target, ...(duration === undefined ? {} : { duration }) }, eventData)
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
    pan: (across, down, input) =>
      map?.panBy(
        [across * PAN_STEP, down * PAN_STEP],
        undefined,
        input ? { originalEvent: input } : undefined,
      ),
    tilt(by, input) {
      if (!map) return
      const pitch = Math.min(map.getMaxPitch(), Math.max(0, map.getPitch() + by * TILT_STEP))
      move({ pitch }, input, STEP_EASE)
    },
    turn(by, input) {
      if (map) move({ bearing: map.getBearing() + by * TURN_STEP }, input, STEP_EASE)
    },
    reset() {
      if (home) move({ ...home(), bearing: 0, pitch: 0 }, undefined)
    },
    holds: (element) => Boolean(map?.getContainer().contains(element)),
  }
}

/** The page's one camera, which the canvas attaches its map to. */
export const mapCamera = cameraStore()

/**
 * What `read` takes from the camera's view, for the controls or the scale bar: a component renders
 * again only when its own reading changes, so the zoom buttons sit still while the map pans and
 * the scale moves with the latitude. Before the map attaches, as in the prerendered page, `read`
 * gets no view, and must give a value equal to itself by `===` each time: React checks that
 * reading, so a reader that gives NaN or a new object there warns on every hydration.
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
