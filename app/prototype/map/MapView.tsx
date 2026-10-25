'use client'
// The map: MapLibre with the recoloured Positron, a deck.gl MapLibreOverlay, and one
// requestAnimationFrame loop outside React that moves the vehicles and hands deck.gl fresh
// layers each frame. React state never holds a position.
import { useEffect, useMemo, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { MapLibreOverlay } from '@deck.gl/maplibre'
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import { PathStyleExtension } from '@deck.gl/extensions'
import type { Layer, PickingInfo } from '@deck.gl/core'
import type { StyleSpecification } from 'maplibre-gl'
import routesJson from '../../../data/routes.json'
import {
  buildLines,
  createSim,
  step,
  STATES,
  type Line,
  type RawLine,
  type Sim,
  type StateIndex,
} from './sim'
import { buildLook, type Variant, type VariantLook } from './glyphs'
import { buildStyle } from './style'
import type { Mode, Theme } from './perron'
import { VehicleGlyphLayer } from './VehicleGlyphLayer'

export interface Picked {
  line: string
  mode: Mode
  state: StateIndex
  stateName: (typeof STATES)[number]
}

export interface StatsSummary {
  frames: number
  seconds: number
  fpsMedian: number
  fpsMean: number
  frameP50: number
  frameP95: number
  simMean: number
  simP50: number
  simP95: number
  deckMean: number
  deckP50: number
  deckP95: number
}

export interface MapViewProps {
  theme: Theme
  variant: Variant
  interleaved: boolean
  count: number
  zoom?: number
  lon?: number
  lat?: number
  onPick: (p: Picked | null) => void
  onStats: (s: StatsSummary) => void
}

/** Ring buffers of per-frame timings, read by the readout and by scripts/measure.mjs. */
class Recorder {
  private cap = 60 * 60 * 5
  private interval = new Float32Array(this.cap)
  private sim = new Float32Array(this.cap)
  private deck = new Float32Array(this.cap)
  private n = 0
  private start = performance.now()

  reset() {
    this.n = 0
    this.start = performance.now()
  }

  push(interval: number, sim: number, deck: number) {
    if (this.n >= this.cap) return
    this.interval[this.n] = interval
    this.sim[this.n] = sim
    this.deck[this.n] = deck
    this.n++
  }

  summary(lastSeconds?: number): StatsSummary {
    let from = 0
    if (lastSeconds) {
      let acc = 0
      for (let i = this.n - 1; i >= 0; i--) {
        acc += this.interval[i]
        if (acc > lastSeconds * 1000) {
          from = i
          break
        }
      }
    }
    const slice = (a: Float32Array) => Array.from(a.subarray(from, this.n)).sort((x, y) => x - y)
    const pct = (s: number[], p: number) =>
      s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0
    const mean = (s: number[]) => (s.length ? s.reduce((x, y) => x + y, 0) / s.length : 0)
    const iv = slice(this.interval)
    const sm = slice(this.sim)
    const dk = slice(this.deck)
    // Frames per second in 1 s buckets, then the median bucket.
    const buckets: number[] = []
    let acc = 0
    let cnt = 0
    for (let i = from; i < this.n; i++) {
      acc += this.interval[i]
      cnt++
      if (acc >= 1000) {
        buckets.push(cnt)
        acc -= 1000
        cnt = 0
      }
    }
    buckets.sort((x, y) => x - y)
    const seconds = iv.reduce((x, y) => x + y, 0) / 1000
    return {
      frames: iv.length,
      seconds,
      fpsMedian: pct(buckets, 0.5),
      fpsMean: seconds ? iv.length / seconds : 0,
      frameP50: pct(iv, 0.5),
      frameP95: pct(iv, 0.95),
      simMean: mean(sm),
      simP50: pct(sm, 0.5),
      simP95: pct(sm, 0.95),
      deckMean: mean(dk),
      deckP50: pct(dk, 0.5),
      deckP95: pct(dk, 0.95),
    }
  }
}

declare global {
  interface Window {
    mylderProto?: {
      ready: boolean
      tilesLoaded: boolean
      count: number
      positions: Float64Array
      reset: () => void
      stats: (lastSeconds?: number) => StatsSummary
      map: maplibregl.Map
    }
  }
}

const LINES: Line[] = buildLines(routesJson as unknown as { lines: Record<string, RawLine> })

/** Dot sizes are tokens "at the default zoom"; far out they shrink, close in they grow. */
function radiusScaleFor(zoom: number): number {
  if (zoom < 10.5) return 0.6
  if (zoom < 12) return 0.6 + ((zoom - 10.5) / 1.5) * 0.25
  if (zoom < 14) return 0.85 + ((zoom - 12) / 2) * 0.15
  if (zoom < 16) return 1 + ((zoom - 14) / 2) * 0.2
  return 1.2
}

// Under the first label layer when interleaved, so dots go beneath place names.
const BEFORE_ID = 'waterway_line_label'

function buildLayers(
  sim: Sim,
  look: VariantLook,
  interleaved: boolean,
  radiusScale: number,
): Layer[] {
  const n = sim.n
  const beforeId = interleaved ? BEFORE_ID : undefined
  const getPosition = { value: sim.positions, size: 3 }
  const layers: Layer[] = []
  if (look.tails) {
    layers.push(
      new PathLayer({
        id: 'tails',
        beforeId,
        data: {
          length: sim.liveCount,
          startIndices: sim.tailStart,
          attributes: {
            getPath: { value: sim.tailPath, size: 3 },
            getColor: { value: look.tails.colour, size: 4 },
          },
        },
        _pathType: 'open',
        widthUnits: 'pixels',
        getWidth: look.tails.width,
        capRounded: true,
        jointRounded: true,
        pickable: false,
      }),
    )
  }
  layers.push(
    new ScatterplotLayer({
      id: 'halo',
      beforeId,
      data: {
        length: n,
        attributes: { getPosition, getRadius: { value: look.halo.radius, size: 1 } },
      },
      radiusUnits: 'pixels',
      radiusScale,
      filled: true,
      stroked: false,
      getFillColor: look.halo.colour,
      pickable: false,
    }),
  )
  if (look.ring) {
    layers.push(
      new ScatterplotLayer({
        id: 'ring',
        beforeId,
        data: {
          length: n,
          attributes: {
            getPosition,
            getRadius: { value: look.ring.radius, size: 1 },
            getLineColor: { value: look.ring.colour, size: 4 },
          },
        },
        radiusUnits: 'pixels',
        radiusScale,
        lineWidthUnits: 'pixels',
        getLineWidth: look.ring.width,
        filled: false,
        stroked: true,
        pickable: false,
      }),
    )
  }
  layers.push(
    new VehicleGlyphLayer({
      id: 'glyph',
      beforeId,
      data: {
        length: n,
        attributes: {
          getPosition,
          getRadius: { value: look.glyph.radius, size: 1 },
          getLineWidth: { value: look.glyph.lineWidth, size: 1 },
          getFillColor: { value: look.glyph.fill, size: 4 },
          getLineColor: { value: look.glyph.line, size: 4 },
          getDashArray: { value: look.glyph.dash, size: 2 },
          getCut: { value: look.glyph.cut, size: 1 },
        },
      },
      radiusUnits: 'pixels',
      radiusScale,
      lineWidthUnits: 'pixels',
      filled: true,
      stroked: true,
      antialiasing: true,
      extensions: [new PathStyleExtension({ dash: true })],
      pickable: true,
    }),
  )
  return layers
}

export default function MapView(props: MapViewProps) {
  const { theme, variant, interleaved, count, zoom, lon, lat, onPick, onStats } = props
  const container = useRef<HTMLElement>(null)
  const lookRef = useRef<VariantLook | null>(null)
  const onPickRef = useRef(onPick)
  const onStatsRef = useRef(onStats)
  useEffect(() => {
    onPickRef.current = onPick
    onStatsRef.current = onStats
  })

  // The simulation lives as long as the map does; the look follows the variant and theme.
  const sim = useMemo(() => createSim(LINES, count), [count])
  useEffect(() => {
    lookRef.current = buildLook(variant, sim, LINES, theme)
  }, [variant, theme, sim])

  useEffect(() => {
    const el = container.current
    if (!el) return
    let disposed = false
    let map: maplibregl.Map | null = null
    let raf = 0
    let timer = 0
    const rec = new Recorder()

    const run = async () => {
      maplibregl.setWorkerUrl(
        new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString(),
      )
      const positron = (await (await fetch('/positron.base.json')).json()) as StyleSpecification
      if (disposed) return
      const phone = el.clientWidth < 600
      map = new maplibregl.Map({
        container: el,
        style: buildStyle(positron, theme, LINES),
        center: [lon ?? 12.565, lat ?? 55.68],
        zoom: zoom ?? (phone ? 10.4 : 11.2),
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: false },
      })
      const overlay = new MapLibreOverlay({
        interleaved,
        layers: [],
        pickingRadius: 12,
        onClick: (info: PickingInfo) => {
          if (info.layer?.id === 'glyph' && info.index >= 0) {
            const i = info.index
            const l = LINES[sim.line[i]]
            const state = sim.state[i] as StateIndex
            onPickRef.current({ line: l.id, mode: l.mode, state, stateName: STATES[state] })
          } else {
            onPickRef.current(null)
          }
        },
      })
      map.addControl(overlay)

      const api = {
        ready: true,
        tilesLoaded: false,
        count,
        positions: sim.positions,
        reset: () => rec.reset(),
        stats: (lastSeconds?: number) => rec.summary(lastSeconds),
        map,
      }
      window.mylderProto = api
      map.once('idle', () => {
        api.tilesLoaded = true
      })

      let last = performance.now()
      let radiusScale = radiusScaleFor(map.getZoom())
      map.on('zoom', () => {
        radiusScale = radiusScaleFor(map!.getZoom())
      })
      const frame = (ts: number) => {
        const interval = ts - last
        last = ts
        const look = lookRef.current!
        const t0 = performance.now()
        step(sim, LINES, Math.min(0.1, interval / 1000), look.tails !== null)
        const t1 = performance.now()
        overlay.setProps({ layers: buildLayers(sim, look, interleaved, radiusScale) })
        const t2 = performance.now()
        rec.push(interval, t1 - t0, t2 - t1)
        raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame((ts) => {
        last = ts
        raf = requestAnimationFrame(frame)
      })
      timer = window.setInterval(() => onStatsRef.current(rec.summary(2)), 500)
    }
    void run()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.clearInterval(timer)
      delete window.mylderProto
      map?.remove()
    }
  }, [theme, interleaved, sim, count, zoom, lon, lat])

  return (
    <section
      ref={container}
      className="proto-map"
      aria-label="Map of Copenhagen with simulated vehicles"
    />
  )
}
