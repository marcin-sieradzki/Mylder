// The Vehicles list's rows (docs/screens.md, "The Vehicles list"): every trip on the map, after the
// filters, with its line, destination, data state by the clock and delay, sorted by a column and
// found by line or destination. The order holds still between snapshots: each column's order ends
// on the trip's key, so two rows that tie keep their places whichever way the column runs.
import type { DataState } from '../domain/data-state'
import type { DataStates } from '../map/states'
import { onMap } from '../map/vehicles'
import type { Mode } from '../timetable/format'
import type { Network } from '../timetable/network'
import type { VehicleTableColumn } from '@mylder/perron/patterns'
import type { Snapshot, SnapshotTrip } from '../tracker/index'
import { DELAY_KNOWN } from './delays'

/** A column the list sorts by, as Perron's VehicleTable names it; the list shows no Last seen. */
export type ListColumn = Exclude<VehicleTableColumn, 'last-seen'>

/** Whether a header Perron's table asks to sort by is one of the list's. */
export const isListColumn = (column: VehicleTableColumn): column is ListColumn =>
  column !== 'last-seen'

export interface ListSort {
  readonly column: ListColumn
  readonly direction: 'asc' | 'desc'
}

/** The list opens sorted by line. */
export const FIRST_SORT: ListSort = { column: 'line', direction: 'asc' }

export interface ListRow {
  readonly trip: SnapshotTrip
  /** The line's colour token from the timetable, or none before it has loaded. */
  readonly colour?: string
  /** Its data state by the clock. */
  readonly state: DataState
  /** Whole minutes late, negative early; none where the trip carries none or its state shows none. */
  readonly delay?: number
  /** Its line and destination folded for search, once per row rather than once per keystroke. */
  readonly words: string
}

/** The modes in the list's line order; the light rail sits with the trains. */
const MODE_ORDER: readonly Mode[] = ['metro', 's-tog', 'train', 'light-rail', 'bus']

/** The states from the freshest position to the least sure, as the key lists them. */
const STATE_ORDER: readonly DataState[] = [
  'live',
  'ageing',
  'estimated',
  'timetable-only',
  'no-signal',
]

/** The rows of the trips on the map with the filters `hidden`, each in its state by the clock. */
export function rowsOf(
  snapshot: Snapshot,
  states: DataStates,
  hidden: ReadonlySet<Mode>,
  network: Network | undefined,
): ListRow[] {
  return snapshot.trips
    .filter((trip) => onMap(trip, hidden))
    .map((trip) => {
      const state = states.get(trip.key) ?? trip.state
      const pattern = network?.patterns.patterns[trip.pattern]
      const colour = pattern && network.patterns.lines[pattern.line]?.colour
      const delay =
        trip.delay !== undefined && DELAY_KNOWN.has(state) ? Math.round(trip.delay / 60) : undefined
      return {
        trip,
        state,
        words: `${folded(trip.line)}\n${folded(trip.headsign)}`,
        ...(colour ? { colour } : {}),
        ...(delay === undefined ? {} : { delay }),
      }
    })
}

/** Folds case and accents away, so "norreport" finds "Nørreport St." and "5c" finds "5C". */
const folded = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('ø', 'o')
    .replaceAll('æ', 'ae')
    .replaceAll('Ø', 'O')
    .replaceAll('Æ', 'AE')
    .toLocaleLowerCase('da')

/** The rows whose line or destination holds `query`; every row for an empty one. */
export function matching(rows: readonly ListRow[], query: string): readonly ListRow[] {
  const words = folded(query.trim())
  if (!words) return rows
  return rows.filter((row) => row.words.includes(words))
}

type Compare = (a: ListRow, b: ListRow) => number

/** Line names in numeric order, "2A" before "10", and destinations as Danish sorts them. */
const collator = new Intl.Collator('da', { numeric: true, sensitivity: 'base' })

const byLine: Compare = (a, b) =>
  MODE_ORDER.indexOf(a.trip.mode) - MODE_ORDER.indexOf(b.trip.mode) ||
  collator.compare(a.trip.line, b.trip.line)

const byDestination: Compare = (a, b) => collator.compare(a.trip.headsign, b.trip.headsign)

/** State order, then within a state the one reported, or else seen, most recently first. */
const byPosition: Compare = (a, b) =>
  STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
  (b.trip.reported ?? b.trip.seen ?? 0) - (a.trip.reported ?? a.trip.seen ?? 0)

const COMPARE: Readonly<Record<Exclude<ListColumn, 'delay'>, Compare>> = {
  line: byLine,
  destination: byDestination,
  position: byPosition,
}

/** The trip's key, the tie-break every order ends on, the same way whichever way a column runs. */
const byKey: Compare = (a, b) => (a.trip.key < b.trip.key ? -1 : a.trip.key > b.trip.key ? 1 : 0)

/** The rows in `sort`'s order; a row without a delay sorts last by delay, whichever way. */
export function sorted(rows: readonly ListRow[], sort: ListSort): ListRow[] {
  const sign = sort.direction === 'asc' ? 1 : -1
  const { column } = sort
  const compare: Compare =
    column === 'delay'
      ? (a, b) =>
          a.delay === undefined || b.delay === undefined
            ? Number(a.delay === undefined) - Number(b.delay === undefined)
            : sign * (a.delay - b.delay)
      : (a, b) => sign * COMPARE[column](a, b)
  return [...rows].sort((a, b) => compare(a, b) || byKey(a, b))
}
