'use client'
// The prototype skill's floating bottom bar: previous, label, next, with the arrow keys as
// shortcuts. Hidden in production builds so a stray merge can't ship it. In a production
// build (`next start`) switch with `?variant=` in the URL.
import { useEffect } from 'react'

interface Props<V extends string> {
  variants: readonly V[]
  current: V
  label: string
  blurb: string
  onChange: (v: V) => void
}

export default function PrototypeSwitcher<V extends string>({
  variants,
  current,
  label,
  blurb,
  onChange,
}: Props<V>) {
  const index = Math.max(0, variants.indexOf(current))
  const prev = variants[(index - 1 + variants.length) % variants.length]
  const next = variants[(index + 1) % variants.length]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') onChange(prev)
      if (e.key === 'ArrowRight') onChange(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, onChange])

  if (process.env.NODE_ENV === 'production') return null

  return (
    <div className="proto-switcher" role="toolbar" aria-label="Prototype variants">
      <button type="button" onClick={() => onChange(prev)} aria-label="Previous variant">
        ←
      </button>
      <div className="proto-switcher-label">
        <span>
          {current.toUpperCase()} ({label})
        </span>
        <small>{blurb}</small>
      </div>
      <button type="button" onClick={() => onChange(next)} aria-label="Next variant">
        →
      </button>
    </div>
  )
}
