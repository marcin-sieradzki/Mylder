'use client'

import { HighlightChip } from '@mylder/perron'
import { useEffect } from 'react'
import { useI18n } from '../i18n/useI18n'
import { mapHighlight, useHighlight, type HighlightLabel } from '../map/highlight'
import { mapView } from '../map/view'
import { aboutDialog } from './about'
import styles from './MapHighlight.module.css'
import { fill } from './vehicleLabel'

/**
 * The highlight chip (docs/screens.md, "The highlight chip"): while something is highlighted on
 * the map, from whichever screen raised it, a pressed chip over the map names it, "Showing: line
 * 5C · Clear", and a press clears it. Esc clears it too, once nothing above it is open: Esc
 * closes a dialog first, then a detail panel, then the highlight.
 */
export function MapHighlight() {
  const { dictionary } = useI18n()
  const words = dictionary.highlight
  const highlight = useHighlight()
  const shown = highlight !== undefined

  useEffect(() => {
    if (!shown) return
    // Heard before anything else hears the key, so a dialog or a panel Esc closes is still open.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || aboutDialog.isOpen() || mapView.get().panel) return
      mapHighlight.clear()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [shown])

  if (!highlight) return null
  const label = labelOf(highlight.label, words)
  return (
    <HighlightChip
      selected
      className={styles.chip}
      onChange={(_, on) => {
        if (!on) mapHighlight.clear()
      }}
    >
      {`${fill(words.showing, { label })} · ${words.clear}`}
    </HighlightChip>
  )
}

const labelOf = (label: HighlightLabel, words: { line: string }) =>
  label.kind === 'line' ? fill(words.line, { line: label.line }) : label.text
