'use client'

import { Link, SearchField } from '@mylder/perron'
import { DataStatePanel, VehicleTable } from '@mylder/perron/patterns'
import { useDeferredValue, useMemo, useState, type MouseEvent, type SyntheticEvent } from 'react'
import type { ClientDictionary } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import { useLastAnswer, useSnapshot } from '../map/live'
import { usePaused } from '../map/notices'
import { useDataStates } from '../map/states'
import { timezoneOf, useNetwork } from '../map/timetable'
import { mapView, openPanel, searchWith, useHiddenModes } from '../map/view'
import { clockTime } from '../timetable/time'
import { carriesDelays } from './delays'
import { badgeLine } from './departureRow'
import { PositionsSource } from './PositionsSource'
import { titleOf } from './vehicleLabel'
import styles from './VehicleList.module.css'
import {
  FIRST_SORT,
  isListColumn,
  matching,
  rowsOf,
  sorted,
  type ListRow,
  type ListSort,
} from './vehicleList'

/** The address that opens a trip's detail, the rest of the view kept, for a link's `href`. */
const tripHref = (search: string, key: string) =>
  searchWith(search, { ...mapView.get(), panel: { kind: 'trip', id: key } })

/**
 * Brings a link's `href` up to the view as it is now, just before the browser uses it: the list
 * doesn't render again as the map moves, so the address it rendered may have an old `map=`.
 */
function freshHref(event: SyntheticEvent<HTMLAnchorElement>, key: string) {
  event.currentTarget.setAttribute('href', tripHref(window.location.search, key))
}

/** Opens the trip in place, as the map's own address does, rather than loading the page again. */
function openTrip(event: MouseEvent<HTMLAnchorElement>, key: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  openPanel({ kind: 'trip', id: key })
}

/**
 * The Vehicles list (docs/screens.md, "The Vehicles list"): every trip on the map as a row, the
 * map's text alternative, searchable by line or destination and sorted by a column's header. It
 * follows the mode filters, re-renders when a snapshot lands or a row's state ages, and each
 * destination opens the vehicle's detail.
 */
export function VehicleList() {
  const { dictionary } = useI18n()
  const words = dictionary.vehicleList
  const snapshot = useSnapshot()
  const states = useDataStates()
  const hidden = useHiddenModes()
  const network = useNetwork(snapshot?.timetableVersion)
  const updatedAt = useLastAnswer()
  const paused = usePaused()
  const [query, setQuery] = useState('')
  // Typing stays quick at the peak's 1,500 rows: the rows follow the box a moment later.
  const asked = useDeferredValue(query)
  const [sort, setSort] = useState<ListSort>(FIRST_SORT)

  const rows = useMemo(
    () => (snapshot ? rowsOf(snapshot, states, hidden, network) : []),
    [snapshot, states, hidden, network],
  )
  const shown = useMemo(() => sorted(matching(rows, asked), sort), [rows, asked, sort])
  const vehicles = useMemo(() => {
    const search = window.location.search
    return shown.map((row) => vehicleOf(row, search, dictionary))
  }, [shown, dictionary])
  const timezone = timezoneOf(network)

  return (
    <div className={styles.list}>
      <SearchField
        label={words.search}
        placeholder={words.placeholder}
        items={[]}
        filter={null}
        open={false}
        value={query}
        onChange={(_event, value) => setQuery(value)}
      />
      {updatedAt === undefined || !snapshot ? null : (
        <PositionsSource
          snapshot={snapshot}
          time={clockTime(updatedAt, timezone, { seconds: true })}
          paused={paused}
        />
      )}
      <DataStatePanel
        status={!snapshot ? 'loading' : shown.length === 0 ? 'empty' : 'ready'}
        noDataLabel={rows.length === 0 ? words.none : words.noMatch}
      >
        <div className={styles.scroll}>
          <VehicleTable
            aria-label={dictionary.sheet.vehicles}
            vehicles={vehicles}
            sort={sort}
            onSortChange={(_event, { column, direction }) => {
              if (isListColumn(column)) setSort({ column, direction })
            }}
            delayColumnHidden={!snapshot || !carriesDelays(snapshot)}
          />
        </div>
      </DataStatePanel>
    </div>
  )
}

/**
 * A row as Perron's table takes it, its destination the link that opens the trip, named for the
 * trip as its card is, "Bus 5C to Husum Torv", since many rows share a destination.
 */
function vehicleOf(
  { trip, colour, state, delay }: ListRow,
  search: string,
  dictionary: ClientDictionary,
) {
  const refresh = (event: SyntheticEvent<HTMLAnchorElement>) => freshHref(event, trip.key)
  return {
    id: trip.key,
    line: badgeLine(colour ?? '', trip.mode),
    lineName: trip.line,
    destination: (
      <Link
        href={tripHref(search, trip.key)}
        aria-label={titleOf(trip, dictionary)}
        onPointerDown={refresh}
        onFocus={refresh}
        onClick={(event) => openTrip(event, trip.key)}
      >
        {trip.headsign}
      </Link>
    ),
    variant: state,
    delay: delay ?? null,
  }
}
