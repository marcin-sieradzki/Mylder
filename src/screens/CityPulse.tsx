'use client'

import { Stat, Text } from '@mylder/perron'
import { useId } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useSnapshot } from '../map/live'
import { useHiddenModes } from '../map/view'
import type { Mode } from '../timetable/format'
import type { Snapshot } from '../tracker/index'
import styles from './CityPulse.module.css'
import { grouped } from './numbers'

interface OnTheMove {
  /** The trips underway, not Waiting at their first stop, in the modes the filters show. */
  readonly moving: number
  /** Every trip on the map, Waiting trips included, whatever the filters: the whole. */
  readonly inService: number
}

/** On the move of in service, from the snapshot: a filter narrows what moves, never the whole. */
function onTheMove(snapshot: Snapshot, hidden: ReadonlySet<Mode>): OnTheMove {
  let moving = 0
  let inService = 0
  for (const trip of snapshot.trips) {
    if (trip.cancelled) continue
    inService++
    if (!trip.waiting && !hidden.has(trip.mode)) moving++
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
  const hidden = useHiddenModes()
  const label = useId()
  const figure = snapshot && onTheMove(snapshot, hidden)
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
    </div>
  )
}
