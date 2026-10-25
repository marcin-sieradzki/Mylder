'use client'
// Three variants of the vehicle glyphs on one throwaway route, switchable via `?variant=`,
// with the theme (`?theme=light|dark`) and the overlay mode (`?overlay=overlaid|interleaved`)
// in the URL too, so every state of the prototype has a link.
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { Theme } from './perron'
import { VARIANTS, type Variant } from './glyphs'
import type { Picked, StatsSummary } from './MapView'
import PrototypeSwitcher from './PrototypeSwitcher'
import Legend from './Legend'
import './prototype.css'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

const VARIANT_KEYS = Object.keys(VARIANTS) as Variant[]

function num(v: string | null): number | undefined {
  if (v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export default function MapPrototype() {
  const params = useSearchParams()
  const router = useRouter()
  const theme: Theme = params.get('theme') === 'dark' ? 'dark' : 'light'
  const variantParam = params.get('variant')
  const variant: Variant = VARIANT_KEYS.includes(variantParam as Variant)
    ? (variantParam as Variant)
    : 'a'
  const interleaved = params.get('overlay') === 'interleaved'
  const count = Math.min(20000, Math.max(1, num(params.get('n')) ?? 1500))
  const zoom = num(params.get('z'))
  const lon = num(params.get('lon'))
  const lat = num(params.get('lat'))

  const [picked, setPicked] = useState<Picked | null>(null)
  const [stats, setStats] = useState<StatsSummary | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString())
      if (value === null) next.delete(key)
      else next.set(key, value)
      router.replace(`?${next.toString()}`)
    },
    [params, router],
  )

  return (
    <div className="proto">
      <MapView
        key={`${theme}-${interleaved}-${count}`}
        theme={theme}
        variant={variant}
        interleaved={interleaved}
        count={count}
        zoom={zoom}
        lon={lon}
        lat={lat}
        onPick={setPicked}
        onStats={setStats}
      />

      <div className="proto-top">
        <header className="proto-banner">
          <strong>Prototype.</strong> Simulated vehicles on real line paths, not live data.
          <span className="proto-banner-actions">
            <button
              type="button"
              onClick={() => setParam('theme', theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button
              type="button"
              onClick={() => setParam('overlay', interleaved ? null : 'interleaved')}
            >
              {interleaved ? 'Overlaid' : 'Interleaved'}
            </button>
          </span>
        </header>

        <div className="proto-stats" aria-live="off">
          {stats ? (
            <>
              <span>
                <b>{stats.fpsMedian}</b> fps
              </span>
              <span>frame p95 {stats.frameP95.toFixed(1)} ms</span>
              <span>positions {stats.simMean.toFixed(2)} ms</span>
              <span>deck {stats.deckMean.toFixed(2)} ms</span>
              <span>
                {count.toLocaleString('en')} vehicles · {interleaved ? 'interleaved' : 'overlaid'}
              </span>
            </>
          ) : (
            <span>Loading…</span>
          )}
        </div>
      </div>

      <aside className="proto-side">
        <Legend variant={variant} theme={theme} />
        {picked && (
          <output className="proto-pick">
            <div className="proto-pick-line">
              <b>{picked.line}</b> <span>{MODE_NAMES[picked.mode]}</span>
            </div>
            <div>{picked.stateName}</div>
            <button type="button" onClick={() => setPicked(null)}>
              Close
            </button>
          </output>
        )}
      </aside>

      <PrototypeSwitcher
        variants={VARIANT_KEYS}
        current={variant}
        label={VARIANTS[variant].name}
        blurb={VARIANTS[variant].blurb}
        onChange={(v) => setParam('variant', v)}
      />
    </div>
  )
}

const MODE_NAMES = { bus: 'Bus', metro: 'Metro', stog: 'S-tog', regional: 'Train' } as const
