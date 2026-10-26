'use client'

import { Stat, Text } from '@mylder/perron'
import { useId } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useSnapshot } from '../map/live'
import { useDataStates, type DataStates } from '../map/states'
import { onMap } from '../map/vehicles'
import { useHiddenModes } from '../map/view'
import type { Mode } from '../timetable/format'
import type { Snapshot } from '../tracker/index'
import styles from './CityPulse.module.css'
import { DayProfile } from './DayProfile'
import { grouped } from './numbers'

interface OnTheMove {
  /**
   * The trips underway, not Waiting at their first stop and not No signal by the clock, in the
   * modes the filters show. A trip standing at a stop still counts: the snapshot doesn't say.
   */
  readonly moving: number
  /** Every trip on the map, Waiting trips included, whatever the filters: the whole. */
  readonly inService: number
}

const NO_FILTER: ReadonlySet<Mode> = new Set()

/** On the move of in service, from the snapshot: a filter narrows what moves, never the whole. */
function onTheMove(snapshot: Snapshot, states: DataStates, hidden: ReadonlySet<Mode>): OnTheMove {
  let moving = 0
  let inService = 0
  for (const trip of snapshot.trips) {
    if (!onMap(trip, NO_FILTER)) continue
    inService++
    const state = states.get(trip.key) ?? trip.state
    if (onMap(trip, hidden) && !trip.waiting && state !== 'no-signal') moving++
  }
  return { moving, inService }
}

/**
 * City pulse (docs/screens.md, "City pulse"): the key figures from the snapshot alone, each
 * following the mode filters with the whole kept in view.
 */
export function CityPulse() {
  const { dictionary } = useI18n()
  const words = dictionary.pulse
  const snapshot = useSnapshot()
  const states = useDataStates()
  const hidden = useHiddenModes()
  const label = useId()
  const figure = snapshot && onTheMove(snapshot, states, hidden)
  return (
    <div className={styles.figures}>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a figure and its sub-line, named by its label: no form fieldset */}
      <div role="group" aria-labelledby={label} className={styles.figure}>
        <Stat label={words.onTheMove} slotProps={{ label: { id: label } }}>
          {figure ? grouped(figure.moving) : undefined}
        </Stat>
        {figure ? (
          <Text variant="body-sm" emphasis="secondary" render={<p />} className={styles.whole}>
            {words.inService.replace('{total}', grouped(figure.inService))}
          </Text>
        ) : null}
      </div>
      <DayProfile />
    </div>
  )
}
