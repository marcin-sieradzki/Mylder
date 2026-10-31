// The map's camera as the controls and the keys move it (docs/screens.md, "The moving map" and
// "The 3D view"): zoom in and out by a step, pan, tilt and turn by a step, and reset to the view
// the map opened on, flat and north-up, plus what the scale bar and the zoom buttons read back:
// the zoom, the tilt and the heading. Each move eases, or jumps when the system asks for reduced
// motion. The canvas attaches its MapLibre map; until it has, and where WebGL is missing, the
// controls have nothing to move.
import 'client-only'
import type { CameraOptions, EaseToOptions, Map as MapLibreMap } from 'maplibre-gl'
import { useSyncExternalStore } from 'react'
import type { MediaSetting } from './frames.ts'
import { PHONE_QUERY } from './highlight.ts'

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
  /**
   * Tilts the map into the 3D view, at `VIEW_3D_PITCH`, or lays it flat, keeping its centre, zoom
   * and heading: the 3D toggle's press.
   */
  view3d(on: boolean): void
  /** Turns the map back to north, keeping its centre, zoom and tilt: the compass's press. */
  north(): void
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

/** The tilt the 3D toggle eases the map to, in degrees: the city's blocks in view, short of sky. */
export const VIEW_3D_PITCH = 50

/** How long a tilt or turn by a key eases for, in ms, as MapLibre's own keys do. */
const STEP_EASE = 300
const STEP = 'mylder-step'
/**
 * The curve a step eases along, MapLibre's keys' own: fastest at the start, so a step chained onto
 * one under way carries the map on at speed rather than starting it again from rest.
 */
const easeOut = (t: number) => t * (2 - t)

/**
 * The furthest the keys turn the map ahead of where it is, in degrees: short of half a turn, so it
 * eases the way it was turned rather than the shorter way back.
 */
const MOST_TURN = 180 - TURN_STEP

/**
 * How far ahead of the map a step `by` sets the aim, on one axis, when it is `ahead` already. A
 * press steps on from the aim, so quick presses all count. A key `held` down repeats faster than
 * a step eases, so a repeat leaves the aim be while the map is more than a step from it that way,
 * and steps it on from there once the map is within a step: the aim stays at most two steps
 * ahead, so the map stops soon after the key is let go, and each ease runs on rather than starting
 * over at every repeat, which on a slow renderer would barely move the map at all.
 */
function further(ahead: number, by: number, held: boolean): number {
  if (held && ahead * Math.sign(by) > Math.abs(by)) return ahead
  return ahead + by
}

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
  const move = (target: CameraOptions, input: Event | undefined, ease?: EaseToOptions) => {
    if (!map) return
    const eventData = input ? { originalEvent: input } : undefined
    if (reducedMotion()) map.jumpTo(target, eventData)
    else map.easeTo({ ...ease, ...target }, eventData)
  }
  /**
   * Where the steps under way are going, until the map comes to rest: a press while one eases
   * steps on from there, so every press counts however slowly the map draws.
   */
  let aim: { pitch: number; bearing: number } | undefined
  const rest = () => (aim = undefined)
  const step = (by: { pitch?: number; bearing?: number }, input: Event | undefined) => {
    if (!map) return
    const now = { pitch: map.getPitch(), bearing: map.getBearing() }
    const from = aim ?? now
    const held = input !== undefined && 'repeat' in input && input.repeat === true
    // The turn the aim is ahead of the map, the shorter way round, as MapLibre eases a heading.
    const turned = ((((from.bearing - now.bearing + 180) % 360) + 360) % 360) - 180
    const turn = Math.min(MOST_TURN, Math.max(-MOST_TURN, further(turned, by.bearing ?? 0, held)))
    const tilt = further(from.pitch - now.pitch, by.pitch ?? 0, held)
    const pitch = Math.min(map.getMaxPitch(), Math.max(0, now.pitch + tilt))
    // Aimed where it was going already, as at the most tilt, the ease under way runs on.
    if (aim && pitch === aim.pitch && turn === turned) return
    aim = { pitch, bearing: now.bearing + turn }
    // One ease id, as MapLibre's own keys give theirs, chains each step onto the one under way.
    move(aim, input, { duration: STEP_EASE, easeId: STEP, easing: easeOut })
  }

  return {
    attach(attached, opened) {
      map = attached
      home = opened
      attached.on('move', update)
      attached.on('moveend', rest)
      update()
      return () => {
        attached.off('move', update)
        attached.off('moveend', rest)
        rest()
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
    tilt: (by, input) => step({ pitch: by * TILT_STEP }, input),
    turn: (by, input) => step({ bearing: by * TURN_STEP }, input),
    view3d(on) {
      rest()
      move({ pitch: on ? VIEW_3D_PITCH : 0 }, undefined)
    },
    north() {
      rest()
      move({ bearing: 0 }, undefined)
    },
    reset() {
      rest()
      if (home) move({ ...home(), bearing: 0, pitch: 0 }, undefined)
    },
    holds: (element) => Boolean(map?.getContainer().contains(element)),
  }
}

/** The part of MapLibre's map whose gestures tilt and turn it. */
export type GestureMap = Pick<MapLibreMap, 'dragRotate' | 'touchPitch' | 'touchZoomRotate'>

/** As narrow as a phone; none where the browser has no media queries. */
const systemPhone = (): MediaSetting | null =>
  typeof matchMedia === 'function' ? matchMedia(PHONE_QUERY) : null

/**
 * Lets a right-drag or a Ctrl-drag tilt and turn `map`, a two-finger drag tilt it and a
 * two-finger twist turn it, except while the page is as narrow as a phone (`phone`), where 3D
 * waits for a measured frame rate (ADR 0016): there the gestures only pan and zoom, and the keys
 * alone tilt and turn it. Follows the width across the breakpoint; returns the function that stops
 * following it.
 */
export function gesturesTiltAndTurn(
  map: GestureMap,
  phone: MediaSetting | null = systemPhone(),
): () => void {
  const apply = () => {
    if (phone?.matches) {
      map.dragRotate.disable()
      map.touchPitch.disable()
      map.touchZoomRotate.disableRotation()
    } else {
      map.dragRotate.enable()
      map.touchPitch.enable()
      map.touchZoomRotate.enableRotation()
    }
  }
  apply()
  phone?.addEventListener('change', apply)
  return () => phone?.removeEventListener('change', apply)
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
