// The vehicles' overlay on the map: deck.gl's own canvas over MapLibre's (ADR 0003), drawing
// the live snapshot's vehicles, less the modes the viewer's filters hide, where the motion loop
// moves them each frame, with their glyphs made again when a snapshot lands, a data state turns
// by the clock, a filter or the theme changes, and their size when the zoom moves it. It polls
// the snapshot while the map is open. The number of vehicles drawn is on the map's container as
// `data-vehicles`, for tests.
import 'client-only'
import { MapLibreOverlay } from '@deck.gl/maplibre'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Network } from '../timetable/network.ts'
import type { Snapshot } from '../tracker/index.ts'
import { radiusScaleAt } from './glyphs.ts'
import { liveSnapshot, pollSnapshot } from './live.ts'
import { vehicleLoop } from './loop.ts'
import { readPaint } from './paint.ts'
import { dataStates, serverNow } from './states.ts'
import { timetables } from './timetable.ts'
import { vehicleLayers } from './VehicleGlyphLayer.ts'
import { vehiclePaint, vehiclesOf, type Vehicles } from './vehicles.ts'
import { mapView } from './view.ts'

export interface VehicleOverlay {
  /** Reads Perron's paint again, after the theme changed. */
  repaint(): void
  remove(): void
}

/** Draws the live vehicles over `map`, whose container is `container`. */
export function vehicleOverlay(map: MapLibreMap, container: HTMLElement): VehicleOverlay {
  const root = document.documentElement
  const overlay = new MapLibreOverlay({ interleaved: false, layers: [] })
  map.addControl(overlay)
  let removed = false
  let drawnFrom: Snapshot | undefined
  let vehicles: Vehicles | undefined
  let radiusScale = radiusScaleAt(map.getZoom())

  const render = () => {
    if (!vehicles) return
    overlay.setProps({ layers: vehicleLayers(vehicles, radiusScale) })
    container.dataset.vehicles = String(vehicles.length)
  }
  const loop = vehicleLoop({
    now: () => serverNow(liveSnapshot.get()),
    draw(moved) {
      vehicles = moved
      render()
    },
  })

  // The snapshot's own timetable gives each line its colour; one that won't load leaves the
  // vehicles in their modes' colours rather than off the map.
  const draw = async () => {
    const { snapshot } = liveSnapshot.get()
    if (!snapshot) return
    const network: Network | undefined = await timetables
      .version(snapshot.timetableVersion)
      .catch((error: unknown) => {
        console.error('The timetable could not load', error)
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

  const stopListening = liveSnapshot.subscribe(() => {
    const { snapshot } = liveSnapshot.get()
    if (snapshot === drawnFrom) return
    drawnFrom = snapshot
    void draw()
  })
  const stopAgeing = dataStates.subscribe(() => void draw())
  // A mode filter turned on or off draws the same snapshot again without that mode.
  let filteredBy = mapView.get().hidden
  const stopFiltering = mapView.subscribe(() => {
    const { hidden } = mapView.get()
    if (hidden === filteredBy) return
    filteredBy = hidden
    void draw()
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

  return {
    repaint: () => void draw(),
    remove() {
      removed = true
      stopListening()
      stopAgeing()
      stopFiltering()
      stopPolling()
      loop.stop()
      map.off('zoom', onZoom)
      map.removeControl(overlay)
      delete container.dataset.vehicles
    },
  }
}
