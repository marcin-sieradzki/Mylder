// Where each credit on the map and in the About dialog links to, and whom the aircraft credit
// names for the provider that answered.
import type { AircraftProvider } from '../tracker/aircraft/index'

export const REJSEPLANEN = 'https://www.rejseplanen.dk/'
/**
 * Whom SIRI-ET's delays are credited to: their publisher, by name alone, since the datasets' pages
 * give no licence until Rejseplanen says which applies (spec #146).
 */
export const DELAYS_PUBLISHER = 'Rejsekort & Rejseplan A/S'
export const CC_BY = 'https://creativecommons.org/licenses/by/4.0/'
export const OPENSTREETMAP = 'https://www.openstreetmap.org/copyright'
export const ODBL = 'https://opendatacommons.org/licenses/odbl/'
export const OPENMAPTILES = 'https://openmaptiles.org/'
export const OPENFREEMAP = 'https://openfreemap.org/'
export const MAP_STYLE_LICENCE =
  'https://github.com/marcin-sieradzki/mylder/blob/main/src/map/style/LICENSE.md'
/** The recordings, which keep adsb.lol's answers open under the ODbL, as its share-alike asks. */
export const RECORDINGS = 'https://github.com/marcin-sieradzki/mylder/tree/main/recordings'
export const ADSB_LOL = 'https://adsb.lol/'
export const ADSB_FI = 'https://adsb.fi/'

/** Whom an aircraft credit names, where it links, and whether its data is under the ODbL. */
export interface AircraftCredit {
  readonly name: string
  readonly href: string
  /** Credited to its contributors under the ODbL, as adsb.lol's data is. */
  readonly odbl: boolean
}

/**
 * The aircraft credit for the provider that answered: adsb.lol's contributors under the ODbL,
 * live or recorded, or adsb.fi with a link to its home page, as its terms ask.
 */
export function aircraftCredit(provider: AircraftProvider): AircraftCredit {
  return provider === 'adsb.fi'
    ? { name: 'adsb.fi', href: ADSB_FI, odbl: false }
    : { name: 'adsb.lol', href: ADSB_LOL, odbl: true }
}
