// The overlay on the map: deck.gl's own canvas over MapLibre's (ADR 0003), drawing each kind of
// thing on it, the live snapshot's vehicles and, above them, the live aircraft, in one render a
// frame, which the frame driver (frames.ts) runs. The vehicles, less the modes the viewer's
// filters hide, are where their motion (loop.ts) moves them each frame, and the aircraft, unless
// the Planes filter hides them, where theirs (aircraft-loop.ts) does, with each kind's glyphs made
// again when its snapshot lands, a data state turns by the clock, a filter or the theme changes;
// every dot's size where the zoom puts it. A hover picks a dot of either kind (picking.ts), a tap
// on one opens its panel, and a tap that finds no dot opens the stop under it, if any.
// Each frame drawn moves the camera onto the followed dot (follow.ts). It polls the snapshot while
// the map is open, and the aircraft while the Planes filter shows them too. The numbers of
// vehicles and aircraft drawn are on the map's container as `data-vehicles` and `data-aircraft`,
// for tests.
import 'client-only'
import { MapLibreOverlay } from '@deck.gl/maplibre'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Network } from '../timetable/network.ts'
import type { AircraftSnapshot } from '../tracker/aircraft/index.ts'
import type { Snapshot } from '../tracker/index.ts'
import { aircraftDrawn, aircraftOf, restyled, type DrawnAircraft } from './AircraftGlyphLayer.ts'
import { liveAircraft, pollAircraft } from './aircraft.ts'
import {
  aircraftLookOf,
  aircraftOutline,
  aircraftTokens,
  type AircraftLook,
} from './aircraft-glyphs.ts'
import { aircraftLoop } from './aircraft-loop.ts'
import { aircraftStates } from './aircraft-states.ts'
import { followCamera } from './follow.ts'
import { frameDriver } from './frames.ts'
import { radiusScaleAt } from './glyphs.ts'
import { liveSnapshot, pollSnapshot, serverNow } from './live.ts'
import { vehicleLoop } from './loop.ts'
import { readPaint } from './paint.ts'
import { dotPicking, TAP_RADIUS, type DrawnKind } from './picking.ts'
import { dataStates } from './states.ts'
import { timetables } from './timetable.ts'
import { tripsDrawn } from './VehicleGlyphLayer.ts'
import { vehiclePaint, vehiclesOf, type Vehicles } from './vehicles.ts'
import { STOP_LAYERS } from './style/basemap.ts'
import { mapView, openPanel } from './view.ts'

/**
 * The stop drawn nearest a point on the canvas, within the dots' tap radius, by its id; none
 * where no stop is drawn there, such as a bus stop at a zoom that hides it.
 */
function stopAt(map: MapLibreMap, x: number, y: number): string | undefined {
  const layers = STOP_LAYERS.filter((id) => map.getLayer(id))
  if (layers.length === 0) return undefined
  const r = TAP_RADIUS
  const found = map.queryRenderedFeatures(
    [
      [x - r, y - r],
      [x + r, y + r],
    ],
    { layers },
  )
  let nearest: { id: string; away: number } | undefined
  for (const feature of found) {
    const id: unknown = feature.properties.id
    if (typeof id !== 'string' || feature.geometry.type !== 'Point') continue
    const [lon, lat] = feature.geometry.coordinates
    const at = map.project([lon, lat])
    const away = Math.hypot(at.x - x, at.y - y)
    if (!nearest || away < nearest.away) nearest = { id, away }
  }
  return nearest?.id
}

export interface VehicleOverlay {
  /** Reads Perron's paint again, after the theme changed. */
  repaint(): void
  remove(): void
}

/** Draws the live vehicles and aircraft over `map`, whose container is `container`. */
export function vehicleOverlay(map: MapLibreMap, container: HTMLElement): VehicleOverlay {
  const root = document.documentElement
  const canvas = map.getCanvas()
  // Off a dot, the stop under the pointer is looked up once a frame, where it rests by then, as
  // pointer moves come faster than frames.
  let resting: { x: number; y: number } | undefined
  let cursorFrame: number | undefined
  const cursorOverStops = () => {
    cursorFrame = undefined
    if (resting) canvas.style.cursor = stopAt(map, resting.x, resting.y) ? 'pointer' : ''
  }
  // A tap on a dot opens its panel, a trip's vehicle detail or an aircraft's card, over a stop.
  const picking = dotPicking(container, undefined, {
    onTap(kind, key) {
      openPanel({ kind, id: key })
    },
    onPointer(on, x, y) {
      resting = on ? undefined : { x, y }
      if (on) canvas.style.cursor = 'pointer'
      else cursorFrame ??= requestAnimationFrame(cursorOverStops)
    },
    onMiss(x, y) {
      const stop = stopAt(map, x, y)
      if (stop) openPanel({ kind: 'stop', id: stop })
    },
  })
  const project = (lonLat: [number, number]) => map.project(lonLat)
  const overlay = new MapLibreOverlay({ interleaved: false, layers: [], ...picking.props })
  map.addControl(overlay)
  let removed = false
  let drawnFrom: Snapshot | undefined
  let vehicles: Vehicles | undefined
  let aircraft: DrawnAircraft | undefined
  let radiusScale = radiusScaleAt(map.getZoom())

  /** What is drawn now, bottom to top. */
  const kinds = (): DrawnKind[] => [
    ...(vehicles ? [tripsDrawn(vehicles)] : []),
    ...(aircraft ? [aircraftDrawn(aircraft)] : []),
  ]

  // One render a frame draws every kind, wherever their motion has placed them.
  const render = () => {
    // With nothing left to draw, such as the aircraft alone with the Planes filter turned off,
    // no layers clear what was drawn.
    const drawn = kinds()
    overlay.setProps({ layers: drawn.flatMap((kind) => kind.layers(radiusScale)) })
    if (vehicles) {
      container.dataset.vehicles = String(vehicles.length)
      follow.frame(vehicles, along)
    }
    if (aircraft) container.dataset.aircraft = String(aircraft.length)
    else delete container.dataset.aircraft
    picking.follow(drawn, project)
  }
  const frames = frameDriver({ render })
  const follow = followCamera(map, container)
  const along = (key: string) => loop.along(key)
  const loop = vehicleLoop({
    now: () => serverNow(liveSnapshot.get()),
    frames,
    projection: () => ({ project, zoom: map.getZoom() }),
  })
  const aircraftMotion = aircraftLoop({ now: () => serverNow(liveAircraft.get()), frames })

  // The snapshot's own timetable gives each line its colour; one that won't load leaves the
  // vehicles in their modes' colours rather than off the map. The loader answers with the same
  // failure for a while, and it is logged once.
  let reported: unknown
  const draw = async () => {
    const { snapshot } = liveSnapshot.get()
    if (!snapshot) return
    const network: Network | undefined = await timetables
      .version(snapshot.timetableVersion)
      .catch((error: unknown) => {
        if (error !== reported) console.error('The timetable could not load', error)
        reported = error
        return undefined
      })
    // A newer snapshot may have landed meanwhile: it draws itself.
    if (removed || liveSnapshot.get().snapshot !== snapshot) return
    const paint = readPaint(root, vehiclePaint(network))
    vehicles = vehiclesOf(snapshot, network, paint, dataStates.get(), mapView.get())
    loop.show(vehicles, snapshot, network)
  }

  // The aircraft, drawn again when an answer lands or a state turns by the clock, unless the
  // Planes filter keeps them off the map, once Perron's outline has loaded. Their look is read
  // once per theme; a state turning makes only the glyphs again, and leaves each aircraft's motion
  // as it was.
  let aircraftShown = mapView.get().aircraftHidden !== true
  let outline: string | undefined
  // A load that fails is logged, and asked for again when the next answer lands.
  const loadOutline = () =>
    aircraftOutline().then(
      (loaded) => {
        outline = loaded
        if (!removed) drawAircraft()
      },
      (error: unknown) => console.error("Perron's aircraft glyph could not load", error),
    )
  let lookOfAircraft: AircraftLook | undefined
  // The answer the aircraft's glyphs were last made from.
  let glyphsFrom: AircraftSnapshot | undefined
  const drawAircraft = () => {
    const { snapshot } = liveAircraft.get()
    if (!snapshot || !aircraftShown || outline === undefined) {
      aircraft = glyphsFrom = undefined
      return aircraftMotion.show(undefined)
    }
    const look = (lookOfAircraft ??= aircraftLookOf(readPaint(root, aircraftTokens()), outline))
    const states = aircraftStates.get()
    const restylable = aircraft && glyphsFrom === snapshot ? aircraft : undefined
    aircraft =
      (restylable && restyled(restylable, look, states)) ?? aircraftOf(snapshot, look, states)
    glyphsFrom = snapshot
    aircraftMotion.show(aircraft, snapshot)
  }
  // An answer landing turns its aircraft's states too: both draw once.
  let aircraftAsked = false
  const redrawAircraft = () => {
    if (aircraftAsked) return
    aircraftAsked = true
    queueMicrotask(() => {
      aircraftAsked = false
      if (!removed) drawAircraft()
    })
  }

  // A snapshot landing turns its trips' states too: everything asked for at once draws once.
  let asked = false
  const redraw = () => {
    if (asked) return
    asked = true
    queueMicrotask(() => {
      asked = false
      void draw()
    })
  }

  const stopListening = liveSnapshot.subscribe(() => {
    const { snapshot } = liveSnapshot.get()
    if (snapshot === drawnFrom) return
    drawnFrom = snapshot
    redraw()
  })
  const stopAgeing = dataStates.subscribe(redraw)
  // A mode filter turned on or off draws the same snapshot again without that mode.
  let filteredBy = mapView.get().hidden
  const stopFiltering = mapView.subscribe(() => {
    const { hidden } = mapView.get()
    if (hidden === filteredBy) return
    filteredBy = hidden
    redraw()
  })
  const stopPolling = pollSnapshot()
  drawnFrom = liveSnapshot.get().snapshot
  void draw()
  // While the Planes filter shows them, the aircraft are drawn again as their answers land and
  // their states turn; hidden, neither is watched.
  // The latest answer the watch has heard land, drawn or not.
  let aircraftLanded = liveAircraft.get().snapshot
  const watchAircraft = () => {
    const stopLanding = liveAircraft.subscribe(() => {
      const { snapshot } = liveAircraft.get()
      if (snapshot === aircraftLanded) return
      aircraftLanded = snapshot
      // An answer landing with no outline yet, its load having failed, asks for it again.
      if (snapshot && outline === undefined) loadOutline()
      redrawAircraft()
    })
    const stopTurning = aircraftStates.subscribe(redrawAircraft)
    return () => {
      stopLanding()
      stopTurning()
    }
  }
  let stopWatchingAircraft = aircraftShown ? watchAircraft() : undefined
  // The Planes filter turned off stops the aircraft's poll too; turned on, the poll starts again,
  // asking at once if one fell due meanwhile.
  let stopPollingAircraft = aircraftShown ? pollAircraft() : undefined
  const stopAircraftFilter = mapView.subscribe(() => {
    const shown = mapView.get().aircraftHidden !== true
    if (shown === aircraftShown) return
    aircraftShown = shown
    stopWatchingAircraft?.()
    stopPollingAircraft?.()
    stopWatchingAircraft = shown ? watchAircraft() : undefined
    stopPollingAircraft = shown ? pollAircraft() : undefined
    aircraftLanded = liveAircraft.get().snapshot
    drawAircraft()
  })
  drawAircraft()
  loadOutline()

  const onZoom = () => {
    const scale = radiusScaleAt(map.getZoom())
    if (scale === radiusScale) return
    radiusScale = scale
    frames.request()
  }
  map.on('zoom', onZoom)
  // The picked dot's card follows it as the map pans, even while the dots stand still.
  const onMove = () => picking.follow(kinds(), project)
  map.on('move', onMove)
  // A resized window moves the canvas on the page, which the card's point counts from.
  const onResize = () => {
    picking.resized()
    onMove()
  }
  map.on('resize', onResize)

  return {
    repaint() {
      lookOfAircraft = undefined
      drawAircraft()
      void draw()
    },
    remove() {
      removed = true
      stopListening()
      stopAgeing()
      stopFiltering()
      stopPolling()
      stopWatchingAircraft?.()
      stopAircraftFilter()
      stopPollingAircraft?.()
      loop.stop()
      aircraftMotion.stop()
      frames.stop()
      follow.remove()
      if (cursorFrame !== undefined) cancelAnimationFrame(cursorFrame)
      map.off('zoom', onZoom)
      map.off('move', onMove)
      map.off('resize', onResize)
      map.removeControl(overlay)
      delete container.dataset.vehicles
      delete container.dataset.aircraft
    },
  }
}
