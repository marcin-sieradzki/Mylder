// Perron's aircraft icon as the package ships it, and the aircraft's look the page reads from it
// and from Perron's token sheet now, for the map's tests.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aircraftLookOf, aircraftTokens, outlineOf } from '../map/aircraft-glyphs.ts'
import { readPaint } from '../map/paint.ts'

/** The text of `@mylder/perron/icons/aircraft.svg`. */
export const aircraftIcon = readFileSync(
  join(process.cwd(), 'node_modules', '@mylder', 'perron', 'icons', 'aircraft.svg'),
  'utf8',
)

/** The aircraft's look in the theme now; the test imports Perron's token sheet. */
export const aircraftLookNow = () =>
  aircraftLookOf(readPaint(document.documentElement, aircraftTokens()), outlineOf(aircraftIcon)!)
