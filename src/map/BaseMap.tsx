'use client'
// The map's canvas: MapLibre with the basemap style, repainted when the theme changes and when
// the timetable's network has loaded, and the live vehicles in deck.gl's canvas over it
// (docs/screens.md, "The moving map"; ADR 0003). It opens on the view the address names and keeps
// where it was left in the address (`view.ts`). The map lives outside React: React only names
// the canvas.
import 'client-only'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import type { Network } from '../timetable/network.ts'
import { vehicleOverlay } from './overlay.ts'
import { readPaint, watchTheme } from './paint.ts'
import { basemapStyle, paintTokens } from './style/basemap.ts'
import { timetables } from './timetable.ts'
import { mapView } from './view.ts'

export interface BaseMapProps {
  /** The canvas's accessible name, such as "Live map of Copenhagen". */
  label: string
  className?: string
}

/** Copenhagen's centre, between Nørreport and Kongens Nytorv. */
const CENTRE: [number, number] = [12.565, 55.68]

/** Wide enough for the whole S-tog network on a desktop, and the centre's on a phone. */
const zoomFor = (width: number) => (width < 600 ? 10.4 : 11.2)

export default function BaseMap({ label, className }: BaseMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const name = useRef(label)

  useEffect(() => {
    const element = container.current
    if (!element) return
    const root = document.documentElement
    let network: Network | undefined
    const style = () => basemapStyle(readPaint(root, paintTokens(network)), network)
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
        // MapLibre's own credit until the map's corner credit arrives.
        attributionControl: { compact: false },
      })
    } catch (error) {
      // No WebGL: the page keeps its top bar, and says nothing it cannot back.
      console.error('The map could not start', error)
      return
    }
    map.current = created
    created.getCanvas().setAttribute('aria-label', name.current)
    let disposed = false
    // Where the viewer left the map goes into the address once it comes to rest.
    const keepView = () => {
      const { lng, lat } = created.getCenter()
      mapView.update({ centre: [lng, lat], zoom: created.getZoom() })
    }
    created.on('moveend', keepView)
    const vehicles = vehicleOverlay(created, element)
    const repaint = () => created.setStyle(style(), { diff: true })
    const stopWatching = watchTheme(root, () => {
      repaint()
      vehicles.repaint()
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
      stopWatching()
      vehicles.remove()
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
