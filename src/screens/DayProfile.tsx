'use client'

import { Text } from '@mylder/perron'
import { DataStatePanel, DayProfileChart, type DayProfileChartPoint } from '@mylder/perron/patterns'
import { useId, useMemo } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useSnapshot } from '../map/live'
import { timezoneOf, useDayProfiles, useNetwork } from '../map/timetable'
import type { DayProfiles } from '../timetable/day-profiles'
import type { IsoDate } from '../timetable/format'
import { clockTime, wallClock } from '../timetable/time'
import styles from './DayProfile.module.css'
import { grouped } from './numbers'

const QUARTER = 15 * 60_000

interface PlannedDay {
  /** Each quarter hour's planned trips underway, at its time on the timetable's clock. */
  readonly points: readonly DayProfileChartPoint[]
  /** The day's most, at the first quarter hour that reaches it. */
  readonly peak: { readonly count: number; readonly time: string }
}

/**
 * A day's profile as the chart takes it, or undefined outside the timetable's window. The counts
 * run from the day's midnight a quarter hour apart, each at the time the clock reads then. The
 * chart's axis is one day's clock, so on the day the clocks go back the hour they read twice is
 * drawn once, its first time; on the day they go forward the hour they skip has no points.
 */
function plannedDay(profiles: DayProfiles, day: IsoDate, timezone: string): PlannedDay | undefined {
  const counts = profiles.day(day)
  if (!counts?.length) return undefined
  const midnight = wallClock(day, 0, timezone)
  const points: { time: string; count: number }[] = []
  for (const [i, count] of counts.entries()) {
    const time = clockTime(midnight + i * QUARTER, timezone)
    // Clock times as "HH:MM" sort as text.
    if (points.length === 0 || time > points[points.length - 1].time) points.push({ time, count })
  }
  let peak = points[0]
  for (const point of points) if (point.count > peak.count) peak = point
  return { points, peak }
}

/**
 * City pulse's "Vehicles in service today" (docs/screens.md, "City pulse"): the planned trips
 * underway at each quarter hour of the snapshot's service day, from the timetable's day profiles.
 * The plan, not the day, so it has no "now" marker; the timetable missing shows the panel's error
 * state in its place.
 */
export function DayProfile() {
  const { dictionary } = useI18n()
  const words = dictionary.pulse
  const snapshot = useSnapshot()
  const version = snapshot?.timetableVersion
  const day = snapshot?.serviceDay
  const profiles = useDayProfiles(version)
  const timezone = timezoneOf(useNetwork(version))
  const peakId = useId()
  const planned = useMemo(
    () => (typeof profiles === 'object' && day ? plannedDay(profiles, day, timezone) : undefined),
    [profiles, day, timezone],
  )
  const status = planned
    ? 'ready'
    : profiles === 'failed' || (typeof profiles === 'object' && day)
      ? 'error'
      : 'loading'

  return (
    <DataStatePanel status={status} loadFailedLabel={words.profileMissing}>
      {planned ? (
        <div className={styles.profile}>
          <DayProfileChart
            points={planned.points}
            label={
              <>
                {words.dayProfile} <span className={styles.planned}>{words.planned}</span>
              </>
            }
            slotProps={{ plot: { 'aria-describedby': peakId } }}
          />
          <Text
            id={peakId}
            variant="body-sm"
            emphasis="secondary"
            render={<p />}
            className={styles.peak}
          >
            {words.peak
              .replace('{count}', grouped(planned.peak.count))
              .replace('{time}', planned.peak.time)}
          </Text>
        </div>
      ) : null}
    </DataStatePanel>
  )
}
