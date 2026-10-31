'use client'
// The map's canvas: MapLibre with the basemap style, repainted when the theme changes, when the
// timetable's network has loaded and when the highlight changes, and the live vehicles in
// deck.gl's canvas over it (docs/screens.md, "The moving map"; ADR 0003). It opens on the view
// the address names and keeps where it was left in the address (`view.ts`), except while Follow
// moves it each frame. A new highlight ends Follow and fits the camera to it, clear of the top bar,
// the notices and the legend the screen hands it. The map lives outside React: React only names
// the canvas, and the screen's controls move it through the camera (camera.ts).
import 'client-only'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import { useEffect, useEffectEvent, useRef, type RefObject } from 'react'
import type { Network } from '../timetable/network.ts'
import { mapCamera } from './camera.ts'
import { followedVehicle } from './follow.ts'
import { boundsOf, fitPadding, mapHighlight, type Floating } from './highlight.ts'
import { vehicleOverlay } from './overlay.ts'
import { readPaint, watchTheme } from './paint.ts'
import { basemapStyle, paintTokens } from './style/basemap.ts'
import { timetables } from './timetable.ts'
import { mapView } from './view.ts'

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
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        // The screen's corner credit and its keys (keys.ts) stand in for MapLibre's own.
        attributionControl: false,
        keyboard: false,
      })
    } catch (error) {
      // No WebGL: the page keeps its top bar, and says nothing it cannot back.
      console.error('The map could not start', error)
      return
    }
    // The map stays flat and north-up until the 3D view lets the rider tilt and turn it (ADR
    // 0016): a two-finger twist zooms and pans but doesn't turn it.
    created.touchZoomRotate.disableRotation()
    map.current = created
    created.getCanvas().setAttribute('aria-label', name.current)
    let disposed = false
    // Where the viewer left the map goes into the address once it comes to rest; while Follow
    // moves it each frame, once Follow ends.
    const keepView = () => {
      if (followedVehicle.get() !== undefined) return
      const { lng, lat } = created.getCenter()
      mapView.update({ centre: [lng, lat], zoom: created.getZoom() })
    }
    created.on('moveend', keepView)
    const stopFollowing = followedVehicle.subscribe(keepView)
    // Reset returns to the view the map opens on with no view in the address.
    const detachCamera = mapCamera.attach(created, () => ({
      center: CENTRE,
      zoom: zoomFor(element.clientWidth),
    }))
    const vehicles = vehicleOverlay(created, element)
    const repaint = () => created.setStyle(style(), { diff: true })
    const stopWatching = watchTheme(root, () => {
      repaint()
      vehicles.repaint()
    })
    // A new highlight is drawn, and the camera fits it, clear of what floats over the map.
    const stopHighlighting = mapHighlight.subscribe(() => {
      repaint()
      const highlight = mapHighlight.get()
      const bounds = highlight && boundsOf(highlight)
      if (!bounds) return
      followedVehicle.stop()
      const { clientWidth, clientHeight } = element
      const padding = fitPadding(clientWidth, clientHeight, floating(element))
      created.fitBounds(bounds, { padding, maxZoom: 15 })
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

/** How far down `top` reaches over `map`, and how far up `foot` does, where they are on screen. */
function floatingOver(
  map: HTMLElement,
  top: RefObject<HTMLElement | null> | undefined,
  foot: RefObject<HTMLElement | null> | undefined,
): Floating {
  const area = map.getBoundingClientRect()
  const topEdge = top?.current?.getBoundingClientRect()
  const footEdge = foot?.current?.getBoundingClientRect()
  return {
    ...(topEdge ? { top: topEdge.bottom - area.top } : {}),
    ...(footEdge ? { bottom: area.bottom - footEdge.top } : {}),
  }
}
