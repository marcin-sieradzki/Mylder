'use client'

import { Attribution } from '@mylder/perron'
import type { MouseEvent } from 'react'
import { useI18n } from '../i18n/useI18n'
import { aboutDialog } from './about'

const REJSEPLANEN = 'https://www.rejseplanen.dk/'
const CC_BY = 'https://creativecommons.org/licenses/by/4.0/'
const OPENSTREETMAP = 'https://www.openstreetmap.org/copyright'
const OPENMAPTILES = 'https://openmaptiles.org/'
const OPENFREEMAP = 'https://openfreemap.org/'

/**
 * The Rejseplanen link opens the About dialog, with the full terms, so a phone reader reaches them
 * in one tap; opened in a new tab or without a script, it still leads to Rejseplanen.
 */
const openAbout = (event: MouseEvent<HTMLAnchorElement>) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  aboutDialog.open()
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
      <a href={REJSEPLANEN} onClick={openAbout}>
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
