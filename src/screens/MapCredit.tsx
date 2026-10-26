'use client'

import { Attribution } from '@mylder/perron'
import { useI18n } from '../i18n/useI18n'

// The Rejseplanen link will open the About dialog, with the full terms, once it exists (#34).
const REJSEPLANEN = 'https://www.rejseplanen.dk/'
const CC_BY = 'https://creativecommons.org/licenses/by/4.0/'
const OPENSTREETMAP = 'https://www.openstreetmap.org/copyright'
const OPENMAPTILES = 'https://openmaptiles.org/'
const OPENFREEMAP = 'https://openfreemap.org/'

/**
 * The corner credit (docs/screens.md, "The moving map"): the transit data and the map, each
 * source a link, in place of MapLibre's own.
 */
export function MapCredit() {
  const { dictionary } = useI18n()
  const words = dictionary.credit
  return (
    <Attribution>
      {words.transitData}: <a href={REJSEPLANEN}>Rejseplanen</a> (<a href={CC_BY}>CC BY 4.0</a>)
      {' · '}
      <a href={OPENSTREETMAP}>© {words.openStreetMap}</a>
      {' · '}
      <a href={OPENMAPTILES}>© OpenMapTiles</a>
      {' · '}
      <a href={OPENFREEMAP}>OpenFreeMap</a>
    </Attribution>
  )
}
