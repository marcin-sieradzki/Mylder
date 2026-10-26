import '@mylder/perron/tokens.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AircraftSnapshot } from '../tracker/aircraft/index.ts'
import type { Snapshot } from '../tracker/index.ts'
import { liveAircraft } from './aircraft.ts'
import { liveSnapshot } from './live.ts'
import { pickedVehicle } from './picking.ts'
import { vehicleOverlay, type VehicleOverlay } from './overlay.ts'
import { mapView } from './view.ts'

// deck.gl's overlay draws with WebGL, which jsdom lacks: a stand-in keeps each set of vehicles it
// is given, by the positions the loop moves frame by frame, and the layers of its latest render.
const drawn = vi.hoisted(() => new Set<unknown>())
const rendered = vi.hoisted(() => ({ ids: [] as string[], times: 0 }))
interface Moving {
  readonly getPosition: { readonly value: unknown }
}
interface Drawn {
  readonly id: string
  readonly props: { readonly data: { readonly attributes?: Moving } }
}
const hovering = vi.hoisted(() => ({
  onHover: undefined as ((info: unknown) => void) | undefined,
  onClick: undefined as ((info: unknown) => void) | undefined,
}))
vi.mock('@deck.gl/maplibre', () => ({
  MapLibreOverlay: class {
    constructor({ onHover, onClick }: Record<'onHover' | 'onClick', (info: unknown) => void>) {
      hovering.onHover = onHover
      hovering.onClick = onClick
    }
    setProps({ layers }: { layers: Drawn[] }) {
      rendered.ids = layers.map((layer) => layer.id)
      rendered.times++
      const vehicles = layers.find((layer) => layer.id === 'vehicles')
      if (vehicles) drawn.add(vehicles.props.data.attributes!.getPosition.value)
    }
  },
}))

const recording = join(process.cwd(), 'recordings', 'weekday')
const read = (path: string): string => readFileSync(join(recording, path), 'utf8')
const minute6 = JSON.parse(read('snapshots/0006.json')) as Snapshot
const aircraft = JSON.parse(read('answers/aircraft/0006.json')) as AircraftSnapshot
/** The aircraft's server reads the moment it fetched them, as its answer's date header says. */
const atFetch = (snapshot: AircraftSnapshot) => ({
  snapshot,
  clockOffset: aircraft.fetched - Date.now(),
})

/** The paths the page asked for, in order. */
let asked: string[] = []

/** The timetable routes as the server answers them on the recording; the snapshot's is down. */
const routes = async (input: RequestInfo | URL): Promise<Response> => {
  asked.push(String(input))
  const manifest = JSON.parse(read('timetable/manifest.json')) as {
    version: string
    files: Record<string, string>
  }
  const [, version, file] = /^\/api\/timetable\/([^/]+)\/(\w+)$/.exec(String(input)) ?? []
  if (version !== manifest.version) return new Response(null, { status: 503 })
  const body =
    file === 'manifest' ? JSON.stringify(manifest) : read(`timetable/${manifest.files[file]}`)
  return new Response(body, { headers: { 'content-type': 'application/json' } })
}

/** MapLibre's part the overlay uses; jsdom can't run MapLibre itself. */
const map = {
  addControl() {},
  removeControl() {},
  on() {},
  off() {},
  getZoom: () => 12,
  getCanvas: () => document.createElement('canvas'),
  project: ([x, y]: [number, number]) => ({ x, y }),
} as unknown as MapLibreMap

let overlay: VehicleOverlay | undefined

beforeEach(() => {
  vi.stubGlobal('fetch', routes)
  asked = []
  drawn.clear()
  rendered.ids = []
  rendered.times = 0
})

afterEach(() => {
  overlay?.remove()
  overlay = undefined
  liveSnapshot.update({ snapshot: undefined, failingSince: undefined })
  liveAircraft.update({ snapshot: undefined, off: undefined, clockOffset: 0 })
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('the vehicles over the map', () => {
  it('draws each snapshot once when it lands', async () => {
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveSnapshot.update({ snapshot: minute6 })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    // Whatever else was on its way has landed by the next task.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(drawn.size).toBe(1)
  })

  it('draws the vehicles again when a filter changes, not when the map moves', async () => {
    const container = document.createElement('div')
    liveSnapshot.update({ snapshot: minute6 })
    overlay = vehicleOverlay(map, container)
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    mapView.update({ centre: [12.5683, 55.6761], zoom: 12.5 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(drawn.size).toBe(1)
    mapView.update({ hidden: new Set(['bus']) })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('11'))
    expect(drawn.size).toBe(2)
  })

  it('draws the aircraft above the vehicles, as many as their snapshot holds', async () => {
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveSnapshot.update({ snapshot: minute6 })
    liveAircraft.update(atFetch(aircraft))
    await vi.waitFor(() =>
      expect(container.dataset.aircraft).toBe(String(aircraft.aircraft.length)),
    )
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    expect(rendered.ids).toEqual([
      'vehicle-halos',
      'vehicles',
      'aircraft-halos',
      'aircraft-ticks',
      'aircraft',
    ])
    expect(aircraft.aircraft.length).toBe(27)
  })

  it('renders both kinds once in a frame when both land at once', async () => {
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveSnapshot.update({ snapshot: minute6 })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const before = rendered.times
    liveAircraft.update(atFetch(aircraft))
    liveAircraft.update(atFetch({ ...aircraft, fetched: aircraft.fetched + 1 }))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(container.dataset.aircraft).toBe('27')
    expect(rendered.times - before).toBe(1)
  })

  it('draws no aircraft, and says none, while the aircraft are off', async () => {
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveSnapshot.update({ snapshot: minute6 })
    liveAircraft.update({ off: true })
    await vi.waitFor(() => expect(container.dataset.vehicles).toBe('18'))
    expect(container.dataset.aircraft).toBeUndefined()
    expect(rendered.ids).not.toContain('aircraft')
  })

  it('takes the aircraft off the map while the Planes filter is off, and draws them again on', async () => {
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveSnapshot.update({ snapshot: minute6 })
    liveAircraft.update(atFetch(aircraft))
    await vi.waitFor(() => expect(container.dataset.aircraft).toBe('27'))
    mapView.update({ aircraftHidden: true })
    await vi.waitFor(() => expect(container.dataset.aircraft).toBeUndefined())
    expect(rendered.ids).toEqual(['vehicle-halos', 'vehicles'])
    // An answer that lands while they are off stays off the map.
    liveAircraft.update(atFetch({ ...aircraft, fetched: aircraft.fetched + 1 }))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(container.dataset.aircraft).toBeUndefined()
    mapView.update({ aircraftHidden: false })
    await vi.waitFor(() => expect(container.dataset.aircraft).toBe('27'))
    expect(rendered.ids).toContain('aircraft')
  })

  it('takes the aircraft off the canvas with the Planes filter when no vehicles are drawn', async () => {
    const container = document.createElement('div')
    overlay = vehicleOverlay(map, container)
    liveAircraft.update(atFetch(aircraft))
    await vi.waitFor(() => expect(container.dataset.aircraft).toBe('27'))
    expect(container.dataset.vehicles).toBeUndefined()
    mapView.update({ aircraftHidden: true })
    await vi.waitFor(() => expect(container.dataset.aircraft).toBeUndefined())
    expect(rendered.ids).toEqual([])
    mapView.update({ aircraftHidden: false })
  })

  it('asks for no aircraft while the Planes filter is off, and asks at once when it is on', async () => {
    // A page of its own, whose aircraft poll has not run before.
    vi.resetModules()
    const fresh = {
      overlay: await import('./overlay.ts'),
      view: await import('./view.ts'),
    }
    window.history.replaceState(null, '', '/?hide=aircraft')
    overlay = fresh.overlay.vehicleOverlay(map, document.createElement('div'))
    await vi.waitFor(() => expect(asked).toContain('/api/snapshot'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(asked).not.toContain('/api/aircraft')
    fresh.view.mapView.update({ aircraftHidden: false })
    expect(asked).toContain('/api/aircraft')
    fresh.view.mapView.update({ aircraftHidden: true })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(asked.filter((path) => path === '/api/aircraft')).toHaveLength(1)
  })

  it('looks for a stop under the pointer once a frame, however often it moves', async () => {
    const canvas = document.createElement('canvas')
    let looked = 0
    const overStops = {
      ...map,
      getCanvas: () => canvas,
      getLayer: () => ({}),
      queryRenderedFeatures() {
        looked++
        return [{ properties: { id: '27532' }, geometry: { type: 'Point', coordinates: [5, 5] } }]
      },
    } as unknown as MapLibreMap
    overlay = vehicleOverlay(overStops, document.createElement('div'))
    for (let x = 0; x < 5; x++) hovering.onHover!({ picked: false, index: -1, x, y: 5 })
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(looked).toBe(1)
    expect(canvas.style.cursor).toBe('pointer')
  })
  it('opens the panel of a plane tapped, over a stop under it, with a pointer over it', async () => {
    const canvas = document.createElement('canvas')
    const overStops = {
      ...map,
      getCanvas: () => canvas,
      getLayer: () => ({}),
      queryRenderedFeatures: () => [
        { properties: { id: '27532' }, geometry: { type: 'Point', coordinates: [5, 5] } },
      ],
    } as unknown as MapLibreMap
    const container = document.createElement('div')
    overlay = vehicleOverlay(overStops, container)
    liveAircraft.update(atFetch(aircraft))
    await vi.waitFor(() => expect(container.dataset.aircraft).toBe('27'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const onPlane = { picked: true, index: 3, layer: { id: 'aircraft' }, x: 5, y: 5 }
    hovering.onHover!(onPlane)
    const hex = pickedVehicle.get()?.key
    expect(aircraft.aircraft.map((each) => each.hex)).toContain(hex)
    expect(canvas.style.cursor).toBe('pointer')
    hovering.onClick!(onPlane)
    expect(mapView.get().panel).toEqual({ kind: 'aircraft', id: hex })
  })
})
