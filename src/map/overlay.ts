// The vehicles' overlay on the map: deck.gl's own canvas over MapLibre's (ADR 0003), drawing
// the live snapshot's vehicles, less the modes the viewer's filters hide, where the motion loop
// moves them each frame, with their glyphs made again when a snapshot lands, a data state turns
// by the clock, a filter or the theme changes, and their size when the zoom moves it. A hover
// picks a dot for its card (picking.ts), a tap on one opens its detail, and a tap that finds no
// dot opens the stop under it, if any. Each frame drawn moves the camera onto the followed dot
// (follow.ts). It polls the snapshot while the map is open. The number of vehicles drawn is on
// the map's container as `data-vehicles`, for tests.
import 'client-only'
import { MapLibreOverlay } from '@deck.gl/maplibre'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Network } from '../timetable/network.ts'
import type { Snapshot } from '../tracker/index.ts'
import { followCamera } from './follow.ts'
import { radiusScaleAt } from './glyphs.ts'
import { liveSnapshot, pollSnapshot, serverNow } from './live.ts'
import { vehicleLoop } from './loop.ts'
import { readPaint } from './paint.ts'
import { TAP_RADIUS, vehiclePicking } from './picking.ts'
import { dataStates } from './states.ts'
import { timetables } from './timetable.ts'
import { vehicleLayers } from './VehicleGlyphLayer.ts'
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

/** Draws the live vehicles over `map`, whose container is `container`. */
export function vehicleOverlay(map: MapLibreMap, container: HTMLElement): VehicleOverlay {
  const root = document.documentElement
  const canvas = map.getCanvas()
  const picking = vehiclePicking(container, undefined, {
    onTap(key) {
      openPanel({ kind: 'trip', id: key })
    },
    onPointer(onDot, x, y) {
      canvas.style.cursor = onDot || stopAt(map, x, y) !== undefined ? 'pointer' : ''
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
  let radiusScale = radiusScaleAt(map.getZoom())

  const render = () => {
    if (!vehicles) return
    overlay.setProps({ layers: vehicleLayers(vehicles, radiusScale) })
    container.dataset.vehicles = String(vehicles.length)
    picking.follow(vehicles, project)
  }
  const follow = followCamera(map, container)
  const along = (key: string) => loop.along(key)
  const loop = vehicleLoop({
    now: () => serverNow(liveSnapshot.get()),
    draw(moved) {
      vehicles = moved
      follow.frame(moved, along)
      render()
    },
  })

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
    loop.show(
      vehiclesOf(snapshot, network, paint, dataStates.get(), mapView.get()),
      snapshot,
      network,
    )
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

  const onZoom = () => {
    const scale = radiusScaleAt(map.getZoom())
    if (scale === radiusScale) return
    radiusScale = scale
    render()
  }
  map.on('zoom', onZoom)
  // The picked dot's card follows it as the map pans, even while the dots stand still.
  const onMove = () => vehicles && picking.follow(vehicles, project)
  map.on('move', onMove)
  // A resized window moves the canvas on the page, which the card's point counts from.
  const onResize = () => {
    picking.resized()
    onMove()
  }
  map.on('resize', onResize)

  return {
    repaint: () => void draw(),
    remove() {
      removed = true
      stopListening()
      stopAgeing()
      stopFiltering()
      stopPolling()
      loop.stop()
      follow.remove()
      map.off('zoom', onZoom)
      map.off('move', onMove)
      map.off('resize', onResize)
      map.removeControl(overlay)
      delete container.dataset.vehicles
    },
  }
}
