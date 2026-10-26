'use client'

import { Brand, FilterChip, IconButton, Surface, Text } from '@mylder/perron'
import { useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useSnapshot } from '../map/live'
import { usePaused } from '../map/notices'
import { timezoneOf, useNetwork } from '../map/timetable'
import { mapView, useHiddenModes } from '../map/view'
import { MODES, type Mode } from '../timetable/format'
import type { Network } from '../timetable/network'
import { clockTime } from '../timetable/time'
import type { Snapshot } from '../tracker/index'
import { LanguageSwitch } from './LanguageSwitch'
import styles from './TopBar.module.css'

/**
 * When the snapshot's positions are from: the time the server received the position answer it
 * was built from. Only a healthy snapshot was built from one; a failed or spent call's snapshot
 * carries the last positions on, so it names no answer of its own.
 */
const answeredAt = (snapshot: Snapshot): number | undefined =>
  snapshot.api.status === 'ok' ? snapshot.fetched : undefined

/** Perron's `info` icon, "About and help", drawn on the top bar's 18 px grid. */
const INFO_ICON = (
  <svg
    className={styles.icon}
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="9" cy="9" r="7" />
    <path d="M9 8.2v4.3" />
    <circle cx="9" cy="5.6" r=".4" fill="currentColor" />
  </svg>
)

/**
 * The latest answer time this page has seen. It never counts up: a snapshot without an answer of
 * its own keeps the one before.
 */
function useUpdatedAt(snapshot: Snapshot | undefined): number | undefined {
  const [last, setLast] = useState<number>()
  const now = snapshot && answeredAt(snapshot)
  if (now !== undefined && now !== last) setLast(now)
  return now ?? last
}

/** The modes the timetable runs, in Mylder's order: Bus, Metro, S-tog, Train, Light rail. */
const modesOf = (network: Network): Mode[] => {
  const run = new Set(network.patterns.lines.map((line) => line.mode))
  return MODES.filter((mode) => run.has(mode))
}

/** The trips underway in each mode: not cancelled, and not waiting at their first stop. */
function underwayByMode(snapshot: Snapshot | undefined): Map<Mode, number> {
  const counts = new Map<Mode, number>()
  for (const trip of snapshot?.trips ?? []) {
    if (trip.cancelled || trip.waiting) continue
    counts.set(trip.mode, (counts.get(trip.mode) ?? 0) + 1)
  }
  return counts
}

/**
 * The moving map's top bar (docs/screens.md, "The moving map"): the brand, the Updated line, the
 * mode filters, the language switch and the About button, composed from Perron until its TopBar
 * pattern ships.
 */
export function TopBar() {
  const { lang, dictionary } = useI18n()
  const snapshot = useSnapshot()
  const network = useNetwork(snapshot?.timetableVersion)
  const hidden = useHiddenModes()
  const updatedAt = useUpdatedAt(snapshot)
  // While Paused the line keeps the last answer's time and says so.
  const paused = usePaused()
  const underway = underwayByMode(snapshot)
  const timezone = timezoneOf(network)

  const show = (mode: Mode, shown: boolean) => {
    const next = new Set(hidden)
    if (shown) next.delete(mode)
    else next.add(mode)
    mapView.update({ hidden: next })
  }

  return (
    <Surface variant="glass" render={<header />} className={styles.bar}>
      <div className={styles.identity}>
        {/* oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label -- Brand fills the link with its name */}
        <Brand render={<a href={`/${lang}`} />} />
        <Text variant="data-sm" emphasis="secondary" className={styles.updated}>
          {dictionary.topBar[paused ? 'updatedPaused' : 'updated'].replace(
            '{time}',
            updatedAt === undefined ? '—' : clockTime(updatedAt, timezone, { seconds: true }),
          )}
        </Text>
      </div>
      {network ? (
        <fieldset aria-label={dictionary.topBar.modes} className={styles.modes}>
          {modesOf(network).map((mode) => (
            <FilterChip
              key={mode}
              selected={!hidden.has(mode)}
              onChange={(_event, shown) => show(mode, shown)}
              count={underway.get(mode) ?? 0}
            >
              {dictionary.modes[mode]}
            </FilterChip>
          ))}
        </fieldset>
      ) : null}
      <div className={styles.tools}>
        <LanguageSwitch />
        {/* The About dialog is Disruptions and About's (#34); until it lands the button opens nothing. */}
        <IconButton label={dictionary.topBar.about} size="large">
          {INFO_ICON}
        </IconButton>
      </div>
    </Surface>
  )
}
