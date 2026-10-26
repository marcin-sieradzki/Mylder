'use client'

import { Meter, Section, Stat, Text } from '@mylder/perron'
import { DataStateKey, ReportStrip } from '@mylder/perron/patterns'
import { useId, type ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'
import { liveSnapshot, useSnapshot } from '../map/live'
import { serverNow, useDataStates } from '../map/states'
import { useHiddenModes } from '../map/view'
import type { Mode } from '../timetable/format'
import styles from './CityPulse.module.css'
import { DayProfile } from './DayProfile'
import { grouped } from './numbers'
import { pulseOf, type ModeShare, type Share, type Unknown } from './pulse'

/**
 * Each mode's operator or authority, the second line under its meter. The timetable doesn't name
 * them yet, so they are the mode's, never a trip's.
 */
const OPERATORS: Readonly<Record<Mode, string>> = {
  bus: 'Movia',
  metro: 'Metroselskabet',
  's-tog': 'DSB',
  train: 'DSB',
  'light-rail': 'Hovedstadens Letbane',
}

/** A share's colour: green at or above 70 %, amber from 40 %, red under; provisional until #12. */
const colourOf = ({ count, total }: Share) =>
  count / total >= 0.7 ? 'success' : count / total >= 0.4 ? 'warning' : 'danger'

interface FigureProps {
  label: string
  /** The figure, or none when the data can't back it. */
  value?: string
  /** The line under it: what it counts, or why it is "—". */
  children: ReactNode
}

/** A key figure and the line under it, one group named by its label. */
function Figure({ label, value, children }: FigureProps) {
  const id = useId()
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a figure and its sub-line, named by its label: no form fieldset
    <div role="group" aria-labelledby={id} className={styles.figure}>
      <Stat label={label} slotProps={{ label: { id } }}>
        {value}
      </Stat>
      <Text variant="body-sm" emphasis="secondary" render={<p />} className={styles.line}>
        {children}
      </Text>
    </div>
  )
}

/**
 * City pulse (docs/screens.md, "City pulse"): the key figures, a meter per mode and how sure the
 * map is, from the snapshot and the states by the clock alone, so they age with the dots. Each
 * follows the mode filters with the whole kept in view, and a figure the data can't back shows
 * "—" and says why.
 */
export function CityPulse() {
  const { lang, dictionary } = useI18n()
  const words = dictionary.pulse
  const snapshot = useSnapshot()
  const states = useDataStates()
  const hidden = useHiddenModes()
  const sureId = useId()
  // The states tick with the server's clock, so a render follows each moment a figure can change.
  const pulse = snapshot && pulseOf(snapshot, states, hidden, serverNow(liveSnapshot.get()))

  const percent = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 })
  const minutes = new Intl.NumberFormat(lang, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  })
  const why = (unknown: Unknown | 'metro' | 'computed-meters') => words.unknown[unknown]
  const fill = (template: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      template,
    )
  const interval = (seconds: number) =>
    seconds < 120
      ? fill(words.seconds, { seconds })
      : fill(words.minutes, { minutes: Math.round(seconds / 60) })
  const meterLine = ({ mode, share, unknown }: ModeShare) =>
    share
      ? fill(words.modeShare, { count: share.count, total: share.total, operator: OPERATORS[mode] })
      : why(unknown === 'computed-only' ? 'computed-meters' : unknown!)

  if (!pulse)
    return (
      <div className={styles.pulse}>
        <Figure label={words.onTheMove}>{null}</Figure>
      </div>
    )
  const live = pulse.live
  return (
    <div className={styles.pulse}>
      {pulse.stretched !== undefined ? (
        <Text variant="body-sm" render={<p />} className={styles.line}>
          {fill(words.budget, { interval: interval(pulse.stretched) })}
        </Text>
      ) : null}
      <div className={styles.figures}>
        <Figure label={words.onTheMove} value={grouped(pulse.moving)}>
          {fill(words.inService, { total: grouped(pulse.inService) })}
        </Figure>
        {typeof pulse.reported === 'number' ? (
          <Figure label={words.reported} value={grouped(pulse.reported)}>
            {words.reportedSub}
          </Figure>
        ) : (
          <Figure label={words.reported}>{why(pulse.reported)}</Figure>
        )}
        {pulse.delay ? (
          <Figure
            label={words.averageDelay}
            value={minutes.format(pulse.delay.mean / 60).replace('-', '−')}
          >
            {words.averageDelaySub}
          </Figure>
        ) : typeof live === 'string' ? (
          <Figure label={words.reportingLive}>{why(live)}</Figure>
        ) : (
          <Figure label={words.reportingLive} value={percent.format(live.count / live.total)}>
            {fill(words.reportingLiveSub, {
              count: grouped(live.count),
              total: grouped(live.total),
            })}
          </Figure>
        )}
      </div>
      <ReportStrip
        aria-label={words.now}
        counts={{
          live: pulse.states.live,
          ageing: pulse.states.ageing,
          estimated: pulse.states.estimated,
          timetableOnly: pulse.states['timetable-only'],
          noSignal: pulse.states['no-signal'],
        }}
      />
      <Section title={words.byMode}>
        <div className={styles.meters}>
          {pulse.modes.map((each) => (
            <div key={each.mode} className={styles.meter}>
              <Meter
                label={dictionary.modes[each.mode]}
                value={each.share ? (each.share.count / each.share.total) * 100 : null}
                color={each.share ? colourOf(each.share) : 'neutral'}
              />
              <Text variant="caption" emphasis="secondary" render={<p />} className={styles.line}>
                {meterLine(each)}
              </Text>
            </div>
          ))}
        </div>
      </Section>
      <DayProfile />
      <Section title={words.howSure} slotProps={{ title: { id: sureId } }}>
        <DataStateKey
          aria-labelledby={sureId}
          counts={{
            live: pulse.states.live,
            ageing: pulse.states.ageing,
            estimated: pulse.states.estimated,
            timetableOnly: pulse.states['timetable-only'],
            noSignal: pulse.states['no-signal'],
          }}
          liveThreshold={pulse.thresholds.live}
          ageingThreshold={pulse.thresholds.ageing}
          liveDescriptionLabel={words.states.live}
          ageingDescriptionLabel={words.states.ageing}
          estimatedDescriptionLabel={words.states.estimated}
          timetableOnlyDescriptionLabel={words.states.timetableOnly}
          noSignalDescriptionLabel={words.states.noSignal}
        />
      </Section>
    </div>
  )
}
