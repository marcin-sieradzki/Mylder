'use client'

import { Link, SearchField } from '@mylder/perron'
import { DataStatePanel, SourceLine, VehicleTable } from '@mylder/perron/patterns'
import { useMemo, useState, type MouseEvent } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useLastAnswer, useSnapshot } from '../map/live'
import { usePaused } from '../map/notices'
import { useDataStates } from '../map/states'
import { timezoneOf, useNetwork } from '../map/timetable'
import { mapView, openPanel, searchWith, useHiddenModes } from '../map/view'
import { clockTime } from '../timetable/time'
import { badgeLine } from './departureRow'
import styles from './VehicleList.module.css'
import {
  carriesDelays,
  FIRST_SORT,
  matching,
  rowsOf,
  sorted,
  type ListRow,
  type ListSort,
} from './vehicleList'

/** The address that opens a trip's detail, the rest of the view kept, for a link's `href`. */
const tripHref = (key: string) =>
  searchWith(window.location.search, { ...mapView.get(), panel: { kind: 'trip', id: key } })

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
  const [sort, setSort] = useState<ListSort>(FIRST_SORT)

  const rows = useMemo(
    () => (snapshot ? rowsOf(snapshot, states, hidden, network) : []),
    [snapshot, states, hidden, network],
  )
  const shown = useMemo(() => sorted(matching(rows, query), sort), [rows, query, sort])
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
      {updatedAt === undefined ? null : (
        <SourceLine
          sources={[
            { name: 'Rejseplanen', time: clockTime(updatedAt, timezone, { seconds: true }) },
          ]}
          paused={paused}
          sourceUpdatedLabel={words.positionsAt}
        />
      )}
      <DataStatePanel
        status={!snapshot ? 'loading' : shown.length === 0 ? 'empty' : 'ready'}
        noDataLabel={rows.length === 0 ? words.none : words.noMatch}
      >
        <div className={styles.scroll}>
          <VehicleTable
            aria-label={dictionary.sheet.vehicles}
            vehicles={shown.map((row) => vehicleOf(row))}
            sort={sort}
            onSortChange={(_event, next) => {
              if (next.column !== 'last-seen') setSort({ ...next, column: next.column })
            }}
            delayColumnHidden={!snapshot || !carriesDelays(snapshot)}
          />
        </div>
      </DataStatePanel>
    </div>
  )
}

/** A row as Perron's table takes it, its destination the link that opens the trip. */
function vehicleOf({ trip, colour, state, delay }: ListRow) {
  return {
    id: trip.key,
    line: badgeLine(colour ?? '', trip.mode),
    lineName: trip.line,
    destination: (
      <Link href={tripHref(trip.key)} onClick={(event) => openTrip(event, trip.key)}>
        {trip.headsign}
      </Link>
    ),
    variant: state,
    delay: delay ?? null,
  }
}
