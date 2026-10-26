import '@mylder/perron/tokens.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Snapshot } from '../tracker/index.ts'
import { liveSnapshot } from './live.ts'
import { vehicleOverlay, type VehicleOverlay } from './overlay.ts'
import { mapView } from './view.ts'

// deck.gl's overlay draws with WebGL, which jsdom lacks: a stand-in keeps each set of vehicles it
// is given, by the positions the loop moves frame by frame.
const drawn = vi.hoisted(() => new Set<unknown>())
interface Moving {
  readonly getPosition: { readonly value: unknown }
}
vi.mock('@deck.gl/maplibre', () => ({
  MapLibreOverlay: class {
    setProps({ layers }: { layers: { props: { data: { attributes: Moving } } }[] }) {
      drawn.add(layers[0].props.data.attributes.getPosition.value)
    }
  },
}))

const recording = join(process.cwd(), 'recordings', 'weekday')
const read = (path: string): string => readFileSync(join(recording, path), 'utf8')
const minute6 = JSON.parse(read('snapshots/0006.json')) as Snapshot

/** The timetable routes as the server answers them on the recording; the snapshot's is down. */
const routes = async (input: RequestInfo | URL): Promise<Response> => {
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
  drawn.clear()
})

afterEach(() => {
  overlay?.remove()
  overlay = undefined
  liveSnapshot.update({ snapshot: undefined, failingSince: undefined })
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
})
