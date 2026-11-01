'use client'

import { SourceLine } from '@mylder/perron/patterns'
import { useI18n } from '../i18n/useI18n'
import { useClockOffset } from '../map/live'
import type { Snapshot } from '../tracker/index'
import { useServerSecond } from './useServerSecond'

/**
 * A snapshot this far past its poll interval is late: the poll lands up to 4 s after it is due,
 * and asks again up to three times 5 s apart for an answer that isn't new yet.
 */
const LATE_AFTER = 20_000

interface PositionsSourceProps {
  snapshot: Snapshot
  /** The positions' time, `HH:MM:SS`. */
  time: string
  paused: boolean
}

/**
 * Where the snapshot's positions come from and when, "may be out of date" once the snapshot is
 * older than its refresh: "Rejseplanen · positions 08:14:05", or on the timetable source, which
 * asks Rejseplanen nothing and places every vehicle from the timetable, "Timetable · placed
 * 08:14:05". It reads the clock each second on its own, so what it sits beside doesn't render
 * again with it.
 */
export function PositionsSource({ snapshot, time, paused }: PositionsSourceProps) {
  const { dictionary } = useI18n()
  const now = useServerSecond(useClockOffset())
  const late = now - snapshot.fetched > snapshot.pollInterval * 1000 + LATE_AFTER
  const { source, placedAt } = dictionary.timetableOverview
  return (
    <SourceLine
      sources={[
        snapshot.source.kind === 'timetable'
          ? { name: source, label: placedAt, time, outOfDate: late }
          : {
              name: 'Rejseplanen',
              label: dictionary.vehicleList.positionsAt,
              time,
              outOfDate: late,
            },
      ]}
      paused={paused}
    />
  )
}
