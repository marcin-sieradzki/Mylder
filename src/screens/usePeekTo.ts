'use client'

import type { DetailPanelProps } from '@mylder/perron/patterns'
import { useLayoutEffect, useMemo, useState } from 'react'
import { numberOf, readPaint } from '../map/paint'
import { sheetPeek } from '../map/peek'

// A stand-in until Perron's Sheet offers a peek measured down to an element of its own body
// (marcin-sieradzki/perron#191); it goes when that lands.

/** Perron's size.sheet-peek, the least a peek is, so it is Perron's number and no number of ours. */
const SHEET_PEEK = 'perron-size-sheet-peek'

/** Read once the token stylesheet gives it, and kept. */
let least: number | undefined
const leastPeek = (): number => {
  if (least === undefined) {
    const read = numberOf(readPaint(document.documentElement, [SHEET_PEEK]), SHEET_PEEK)
    if (Number.isFinite(read)) least = read
  }
  return least ?? 0
}

/** Base UI's mark on the popup while the rider drags the sheet. */
const SWIPING = 'data-swiping'

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
 * left out, but never while the rider drags the sheet: a new peek waits until the drag ends, so
 * the sheet doesn't move under the finger. The peek is published (src/map/peek.ts) while the sheet
 * is open, so the map's foot stands on it and a fit keeps clear of it. Until it is measured, and
 * off a phone, and while the body has no `until`, such as a stop not found, the panel keeps
 * Perron's own snap points and publishes none.
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
      // Each swipe frame resizes the body; the peek waits for the drag's end.
      if (popup.hasAttribute(SWIPING)) return
      // Both boxes move with the sheet as it snaps, so their distance holds.
      const end =
        until.getBoundingClientRect().bottom - popup.getBoundingClientRect().top + content.scrollTop
      setPeek(Math.ceil(Math.max(end, leastPeek())))
    }
    measure()
    // The header growing shrinks the body, whose height is the sheet's less the header's.
    const resize = new ResizeObserver(measure)
    for (const node of [content, above, until]) if (node) resize.observe(node)
    // A drag's end measures what changed while it lasted.
    const swipe = new MutationObserver(measure)
    swipe.observe(popup, { attributes: true, attributeFilter: [SWIPING] })
    return () => {
      resize.disconnect()
      swipe.disconnect()
    }
  }, [bottom, popup, content, above, until])
  // Nothing to peek down to, as on a stop not found: the peek falls back to Perron's.
  const shown = bottom && until ? peek : undefined
  // Published in the same commit as the snap points change, so the map's foot moves with the sheet.
  useLayoutEffect(() => {
    if (shown === undefined) return
    sheetPeek.set(shown)
    return () => sheetPeek.set(undefined)
  }, [shown])
  const snapPoints = useMemo(() => (shown === undefined ? undefined : [`${shown}px`, 1]), [shown])
  return { snapPoints, popup: setPopup, content: setContent, above: setAbove, until: setUntil }
}
