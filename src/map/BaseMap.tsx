'use client'
// The map's canvas: MapLibre with the basemap style, repainted when the theme changes, when the
// timetable's network has loaded and when the highlight changes, and the live vehicles in
// deck.gl's canvas over it (docs/screens.md, "The moving map"; ADR 0003). It opens on the view
// the address names and keeps where it was left in the address (`view.ts`), except while Follow
// moves it each frame. A new highlight ends Follow and fits the camera to it, clear of the top bar,
// the notices and the legend the screen hands it, moving only the centre and zoom, so a tilted,
// turned map keeps its tilt and heading, as it does under Follow. The map lives outside React:
// React only names the canvas, and the screen's controls move it through the camera (camera.ts).
// The address keeps its heading and tilt too, so a link opens in 3D. Its tilt and heading at rest are on its
// container as `data-tilt` and `data-heading`, for tests.
import 'client-only'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import { useEffect, useEffectEvent, useRef, type RefObject } from 'react'
import type { Network } from '../timetable/network.ts'
import { gesturesTiltAndTurn, mapCamera } from './camera.ts'
import { followedVehicle } from './follow.ts'
import { fitPadding, fitPlace, groundLens, mapHighlight, type Floating } from './highlight.ts'
import { vehicleOverlay } from './overlay.ts'
import { sheetPeek } from './peek.ts'
import { readPaint, watchTheme } from './paint.ts'
import { basemapStyle, paintTokens } from './style/basemap.ts'
import { barImage } from './style/stations.ts'
import { timetables } from './timetable.ts'
import { MAX_PITCH, mapView } from './view.ts'

export interface BaseMapProps {
  /** The canvas's accessible name, such as "Live map of Copenhagen". */
  label: string
  className?: string
  /** What floats at the top of the map, the top bar and the page notices, for a fit to clear. */
  top?: RefObject<HTMLElement | null>
  /** What floats at its foot, the legend, for a fit to clear on a desktop. */
  foot?: RefObject<HTMLElement | null>
}

/** Copenhagen's centre, between Nørreport and Kongens Nytorv. */
const CENTRE: [number, number] = [12.565, 55.68]

/** Wide enough for the whole S-tog network on a desktop, and the centre's on a phone. */
const zoomFor = (width: number) => (width < 600 ? 10.4 : 11.2)

export default function BaseMap({ label, className, top, foot }: BaseMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const name = useRef(label)
  // Measured at each fit, from whichever elements the screen hands it then.
  const floating = useEffectEvent((canvas: HTMLElement) => floatingOver(canvas, top, foot))

  useEffect(() => {
    const element = container.current
    if (!element) return
    const root = document.documentElement
    let network: Network | undefined
    const style = () => {
      const highlight = mapHighlight.get()
      return basemapStyle(readPaint(root, paintTokens(network, highlight)), network, highlight)
    }
    // The address's view, such as one kept through a language switch, or Copenhagen's centre.
    const view = mapView.get()
    let created: MapLibreMap
    try {
      setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString())
      created = new MapLibreMap({
        container: element,
        style: style(),
        center: view.centre ? [view.centre[0], view.centre[1]] : CENTRE,
        zoom: view.zoom ?? zoomFor(element.clientWidth),
        // It opens flat and north-up, unless the address names a heading and tilt, even on a
        // phone, whose gestures don't tilt it, and tilts up to the 3D view's most (ADR 0016).
        bearing: view.bearing ?? 0,
        pitch: view.pitch ?? 0,
        maxPitch: MAX_PITCH,
        // The screen's corner credit and its keys (keys.ts) stand in for MapLibre's own.
        attributionControl: false,
        keyboard: false,
      })
    } catch (error) {
      // No WebGL: the page keeps its top bar, and says nothing it cannot back.
      console.error('The map could not start', error)
      return
    }
    // A right-drag, a Ctrl-drag and two fingers tilt and turn it, except on a phone until its
    // frame rate is measured.
    const stopGestures = gesturesTiltAndTurn(created)
    map.current = created
    created.getCanvas().setAttribute('aria-label', name.current)
    let disposed = false
    // Where the viewer left the map goes into the address once it comes to rest; while Follow
    // moves it each frame, once Follow ends.
    const keepView = () => {
      if (followedVehicle.get() !== undefined) return
      const { lng, lat } = created.getCenter()
      mapView.update({
        centre: [lng, lat],
        zoom: created.getZoom(),
        bearing: created.getBearing(),
        pitch: created.getPitch(),
      })
    }
    created.on('moveend', keepView)
    // Its tilt and heading where it came to rest, to the degree, on its container for tests, as
    // the overlay counts what it draws there.
    const markCamera = () => {
      element.dataset.tilt = String(Math.round(created.getPitch()))
      element.dataset.heading = String(Math.round(created.getBearing()))
    }
    markCamera()
    created.on('moveend', markCamera)
    const stopFollowing = followedVehicle.subscribe(keepView)
    // Reset returns to the view the map opens on with no view in the address.
    const detachCamera = mapCamera.attach(created, () => ({
      center: CENTRE,
      zoom: zoomFor(element.clientWidth),
    }))
    const vehicles = vehicleOverlay(created, element)
    // The stations' bars are drawn when the style first asks for one of a length and colour.
    created.setMissingStyleImageResolver((id) => {
      const pixelRatio = window.devicePixelRatio || 1
      const image = barImage(id, pixelRatio)
      if (image && !created.hasImage(id)) created.addImage(id, image, { pixelRatio })
    })
    const repaint = () => created.setStyle(style(), { diff: true })
    const stopWatching = watchTheme(root, () => {
      repaint()
      vehicles.repaint()
    })
    // A new highlight is drawn, and the camera fits it, clear of what floats over the map, at
    // the tilt and heading the rider left it at.
    const stopHighlighting = mapHighlight.subscribe(() => {
      repaint()
      const highlight = mapHighlight.get()
      if (!highlight) return
      const area = { width: element.clientWidth, height: element.clientHeight }
      const padding = fitPadding(area.width, area.height, floating(element))
      const lens = groundLens({
        ...area,
        pitch: created.getPitch(),
        bearing: created.getBearing(),
        fov: created.getVerticalFieldOfView(),
      })
      const place = fitPlace(highlight, area, padding, lens)
      if (!place) return
      followedVehicle.stop()
      created.flyTo({ center: place.centre, zoom: place.zoom })
    })
    timetables.current().then(
      (loaded) => {
        if (disposed) return
        network = loaded
        repaint()
      },
      (error: unknown) => console.error('The timetable could not load', error),
    )
    return () => {
      disposed = true
      created.off('moveend', keepView)
      created.off('moveend', markCamera)
      delete element.dataset.tilt
      delete element.dataset.heading
      stopGestures()
      stopFollowing()
      stopHighlighting()
      stopWatching()
      vehicles.remove()
      detachCamera()
      created.remove()
      map.current = null
    }
  }, [])

  // A new label, in another language, renames the canvas rather than making a new map.
  useEffect(() => {
    name.current = label
    map.current?.getCanvas().setAttribute('aria-label', label)
  }, [label])

  return <div ref={container} className={className} />
}

/**
 * How far down `top` reaches over `map`, and how far up `foot` does, where they are on screen, and
 * how far a phone's open stop sheet peeks, where it published its peek.
 */
function floatingOver(
  map: HTMLElement,
  top: RefObject<HTMLElement | null> | undefined,
  foot: RefObject<HTMLElement | null> | undefined,
): Floating {
  const area = map.getBoundingClientRect()
  const topEdge = top?.current?.getBoundingClientRect()
  const footEdge = foot?.current?.getBoundingClientRect()
  const peek = sheetPeek.get()
  return {
    ...(topEdge ? { top: topEdge.bottom - area.top } : {}),
    ...(footEdge ? { bottom: area.bottom - footEdge.top } : {}),
    ...(peek === undefined ? {} : { peek }),
  }
}
