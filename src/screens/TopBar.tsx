'use client'

import { FilterChip, IconButton } from '@mylder/perron'
import { TopBar as PerronTopBar } from '@mylder/perron/patterns'
import type { MouseEvent } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useLastAnswer, useSnapshot } from '../map/live'
import { useOutOfDate, usePaused } from '../map/notices'
import { timezoneOf, useNetwork } from '../map/timetable'
import { mapView, useHiddenModes } from '../map/view'
import { MODES, type Mode } from '../timetable/format'
import type { Network } from '../timetable/network'
import { clockTime } from '../timetable/time'
import type { Snapshot } from '../tracker/index'
import { aboutDialog } from './about'
import { LanguageSwitch } from './LanguageSwitch'
import { PerronIcon } from './PerronIcon'

const openAbout = (event: MouseEvent<HTMLButtonElement>) => aboutDialog.open(event.currentTarget)

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
 * The moving map's top bar (docs/screens.md, "The moving map"): Perron's TopBar with the brand,
 * the Updated line, the mode filters, the language switch and the About button, in the page's
 * header. Its phone layout follows the window's width in Perron's own CSS, from one render, so the
 * prerendered page paints a phone its own bar first.
 */
export function TopBar() {
  const { lang, dictionary } = useI18n()
  const snapshot = useSnapshot()
  const network = useNetwork(snapshot?.timetableVersion)
  const hidden = useHiddenModes()
  // The time the server received the latest position answer; while Paused it holds and says so.
  const updatedAt = useLastAnswer()
  const paused = usePaused()
  const outOfDate = useOutOfDate()
  const underway = underwayByMode(snapshot)
  const timezone = timezoneOf(network)

  const show = (mode: Mode, shown: boolean) => {
    const next = new Set(hidden)
    if (shown) next.delete(mode)
    else next.add(mode)
    mapView.update({ hidden: next })
  }

  return (
    <header>
      <PerronTopBar
        size="responsive"
        brandHref={`/${lang}`}
        time={
          updatedAt === undefined ? undefined : clockTime(updatedAt, timezone, { seconds: true })
        }
        // Mylder says a pause after the time, "Updated 07:20:00, paused", so it gives the whole
        // phrase in its own words rather than Perron's "Paused ·" before it.
        updatedLabel={dictionary.topBar[paused ? 'updatedPaused' : 'updated']}
        // Perron's own phrase, "Updated 07:20:00, may be out of date", in the page's language.
        outOfDate={outOfDate}
        filtersLabel={dictionary.topBar.modes}
        filters={
          network
            ? modesOf(network).map((mode) => (
                <FilterChip
                  key={mode}
                  selected={!hidden.has(mode)}
                  onChange={(_event, shown) => show(mode, shown)}
                  count={underway.get(mode) ?? 0}
                >
                  {dictionary.modes[mode]}
                </FilterChip>
              ))
            : undefined
        }
        tools={
          <>
            <LanguageSwitch />
            <IconButton label={dictionary.topBar.about} size="large" onClick={openAbout}>
              <PerronIcon name="info" />
            </IconButton>
          </>
        }
      />
    </header>
  )
}
