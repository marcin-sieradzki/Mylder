'use client'

import { Surface, Text, VehicleDotLegend } from '@mylder/perron'
import { useI18n } from '../i18n/useI18n'
import { useLiveSnapshot } from '../map/live'
import styles from './MapLegend.module.css'

/**
 * The legend (docs/screens.md, "The moving map"): the five data states with their glyphs, in
 * their order, and, while Mylder asks Rejseplanen for computed positions alone, once that no
 * vehicle can be Live (docs/data-states.md, "The states").
 */
export function MapLegend() {
  const { dictionary } = useI18n()
  const calcOnly = useLiveSnapshot().snapshot?.positionMode === 'CALC_REPORT'
  return (
    <Surface variant="glass" className={styles.legend}>
      <VehicleDotLegend aria-label={dictionary.legend.label} />
      {calcOnly ? (
        <Text variant="caption" emphasis="secondary" render={<p />} className={styles.note}>
          {dictionary.legend.noLive}
        </Text>
      ) : null}
    </Surface>
  )
}
