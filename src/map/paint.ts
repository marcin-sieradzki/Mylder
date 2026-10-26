// Perron's tokens as the canvas reads them: CSS custom properties on the document, read once
// per theme change, so one source serves CSS, the basemap and the vehicles (ADR 0004). The
// theme follows the system's colour scheme unless `data-theme` on <html> overrides it.
import 'client-only'
import type { Mode } from '../timetable/format.ts'

/** Token values by name without the leading dashes, such as `perron-color-map-land`. */
export type Paint = ReadonlyMap<string, string>

const REFERENCE = /^var\(\s*--([\w-]+)\s*\)$/

/**
 * Reads the named tokens' values as they are now. A browser substitutes a token that refers to
 * another, `var(--perron-palette-yellow-500)`, in its computed value; one that doesn't is
 * followed here.
 */
export function readPaint(root: Element, names: Iterable<string>): Paint {
  const computed = getComputedStyle(root)
  const value = (name: string, depth = 0): string => {
    const raw = computed.getPropertyValue(`--${name}`).trim()
    const reference = REFERENCE.exec(raw)
    return reference && depth < 8 ? value(reference[1], depth + 1) : raw
  }
  return new Map([...new Set(names)].map((name) => [name, value(name)]))
}

/**
 * The colour token of a mode, which a line takes when Perron has no colour of its own for it:
 * the bus's yellow for a bus, the regional train's for every rail mode.
 */
export const modeColour = (mode: Mode): string =>
  mode === 'bus' ? 'perron-color-transit-mode-bus' : 'perron-color-transit-mode-regional'

/** A token's value as a number, such as `3.2` from `3.2px`, or NaN when it isn't one. */
export const numberOf = (paint: Paint, name: string): number => parseFloat(paint.get(name) ?? '')

/**
 * Calls back whenever the theme may have changed: the system's colour scheme, or `data-theme`
 * on <html>. Returns the function that stops watching.
 */
export function watchTheme(root: HTMLElement, onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
  const scheme =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
  scheme?.addEventListener('change', onChange)
  return () => {
    observer.disconnect()
    scheme?.removeEventListener('change', onChange)
  }
}
