'use client'

import { Attribution } from '@mylder/perron'
import type { MouseEvent } from 'react'
import { useI18n } from '../i18n/useI18n'
import { aboutDialog } from './about'
import { CC_BY, OPENFREEMAP, OPENMAPTILES, OPENSTREETMAP, REJSEPLANEN } from './credits'

/**
 * The Rejseplanen link opens the About dialog, with the full terms, so a phone reader reaches them
 * in one tap; opened in a new tab or without a script, it still leads to Rejseplanen.
 */
const openAboutFromCredit = (event: MouseEvent<HTMLAnchorElement>) => {
  const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey
  if (event.defaultPrevented || !plain || event.altKey) return
  event.preventDefault()
  aboutDialog.open(event.currentTarget)
}

/**
 * The corner credit (docs/screens.md, "The moving map"): the transit data and the map, each
 * source a link, in place of MapLibre's own.
 */
export function MapCredit() {
  const { dictionary } = useI18n()
  const words = dictionary.credit
  return (
    <Attribution>
      {words.transitData}:{' '}
      <a href={REJSEPLANEN} onClick={openAboutFromCredit} aria-haspopup="dialog">
        Rejseplanen
      </a>{' '}
      (<a href={CC_BY}>CC BY 4.0</a>){' · '}
      <a href={OPENSTREETMAP}>© {words.openStreetMap}</a>
      {' · '}
      <a href={OPENMAPTILES}>© OpenMapTiles</a>
      {' · '}
      <a href={OPENFREEMAP}>OpenFreeMap</a>
    </Attribution>
  )
}
