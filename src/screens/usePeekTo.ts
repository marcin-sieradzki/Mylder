'use client'

import type { DetailPanelProps } from '@mylder/perron/patterns'
import { useLayoutEffect, useMemo, useState } from 'react'

/** Where the sheet's peek is read, so it is Perron's `size.sheet-peek` and no number of ours. */
const SHEET_PEEK = '--perron-size-sheet-peek'

/** The elements a peek is measured from, each set by its own ref. */
export interface PeekTo {
  /** The bottom sheet's snap points: a peek that ends under `until`, then full height. */
  readonly snapPoints: DetailPanelProps['snapPoints']
  /** The panel's popup, by DetailPanel's `ref`. */
  readonly popup: (node: HTMLElement | null) => void
  /** The panel's scrolling body, by DetailPanel's `slotProps.content.ref`. */
  readonly content: (node: HTMLElement | null) => void
  /** A block in the body above `until` whose height moves it, such as the standing trips. */
  readonly above: (node: HTMLElement | null) => void
  /** What the peek shows whole, such as the stop's tabs. */
  readonly until: (node: HTMLElement | null) => void
}

/**
 * A phone's bottom sheet whose peek shows everything down to one element of its body whole, such
 * as a stop's tabs under its standing trips (docs/screens.md, "Stop panel"), and never less than
 * Perron's `size.sheet-peek`, so the sheet covers no more of the map than that needs. The peek is
 * measured again whenever the header, the body or the block above resizes, the body's own scroll
 * left out; until it is measured, and off a phone, the panel keeps Perron's own snap points.
 */
export function usePeekTo(bottom: boolean): PeekTo {
  const [popup, setPopup] = useState<HTMLElement | null>(null)
  const [content, setContent] = useState<HTMLElement | null>(null)
  const [above, setAbove] = useState<HTMLElement | null>(null)
  const [until, setUntil] = useState<HTMLElement | null>(null)
  const [peek, setPeek] = useState<number>()
  useLayoutEffect(() => {
    if (!bottom || !popup || !content || !until || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      // Both boxes move with the sheet as it snaps or is swiped, so their distance holds.
      const end =
        until.getBoundingClientRect().bottom - popup.getBoundingClientRect().top + content.scrollTop
      const least = Number.parseFloat(getComputedStyle(popup).getPropertyValue(SHEET_PEEK))
      setPeek(Math.ceil(Number.isFinite(least) ? Math.max(end, least) : end))
    }
    measure()
    // The header growing shrinks the body, whose height is the sheet's less the header's.
    const resize = new ResizeObserver(measure)
    for (const node of [content, above, until]) if (node) resize.observe(node)
    return () => resize.disconnect()
  }, [bottom, popup, content, above, until])
  const snapPoints = useMemo(
    () => (bottom && peek !== undefined ? [`${peek}px`, 1] : undefined),
    [bottom, peek],
  )
  return { snapPoints, popup: setPopup, content: setContent, above: setAbove, until: setUntil }
}
