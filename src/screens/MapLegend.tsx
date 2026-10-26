'use client'

import { Surface, Text, VehicleDotLegend } from '@mylder/perron'
import { useI18n } from '../i18n/useI18n'
import { useAircraftLanded, useAircraftNoDataSince } from '../map/aircraft'
import { useSnapshot } from '../map/live'
import { timezoneOf, useNetwork } from '../map/timetable'
import { useAircraftHidden } from '../map/view'
import { clockTime } from '../timetable/time'
import styles from './MapLegend.module.css'

/**
 * The legend (docs/screens.md, "The moving map"): the five data states with their glyphs, in
 * their order, then Perron's aircraft glyph beside the Planes filter's word while the planes are on
 * the map; while Mylder asks Rejseplanen for computed positions alone, once that no vehicle can be
 * Live (docs/data-states.md, "The states"); while the aircraft feed fails and the planes are
 * shown, since when it has given no data (docs/aircraft.md, "The browser").
 */
export function MapLegend() {
  const { dictionary } = useI18n()
  const snapshot = useSnapshot()
  const calcOnly = snapshot?.positionMode === 'CALC_REPORT'
  const timezone = timezoneOf(useNetwork(snapshot?.timetableVersion))
  const noDataSince = useAircraftNoDataSince()
  const aircraftHidden = useAircraftHidden()
  const aircraftShown = useAircraftLanded() && !aircraftHidden
  return (
    <Surface variant="glass" className={styles.legend}>
      <VehicleDotLegend
        aria-label={dictionary.legend.label}
        aircraftVisible={aircraftShown}
        aircraftLabel={dictionary.topBar.aircraft}
      />
      {calcOnly ? (
        <Text variant="caption" emphasis="secondary" render={<p />} className={styles.note}>
          {dictionary.legend.noLive}
        </Text>
      ) : null}
      {noDataSince !== undefined && aircraftShown ? (
        <Text variant="caption" emphasis="secondary" render={<p />} className={styles.note}>
          {dictionary.legend.aircraftNoData.replace('{time}', clockTime(noDataSince, timezone))}
        </Text>
      ) : null}
    </Surface>
  )
}
