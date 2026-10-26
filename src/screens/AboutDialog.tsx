'use client'

import { Dialog, FactList, Kbd, Link, Section, Text, VehicleDotLabel } from '@mylder/perron'
import { Fragment, type ReactNode } from 'react'
import type { ClientDictionary } from '../i18n/dictionary'
import { intlLocale, type Lang } from '../i18n/lang'
import { useI18n } from '../i18n/useI18n'
import { useSnapshot } from '../map/live'
import { timezoneOf, useNetwork } from '../map/timetable'
import { clockTime } from '../timetable/time'
import type { Snapshot } from '../tracker/index'
import { aboutDialog, useAboutOpen } from './about'
import { budgetLine, intervalOf } from './budget'
import styles from './AboutDialog.module.css'
import {
  CC_BY,
  MAP_STYLE_LICENCE,
  ODBL,
  OPENFREEMAP,
  OPENMAPTILES,
  OPENSTREETMAP,
  REJSEPLANEN,
} from './credits'

type Words = ClientDictionary['about']

/** The five data states in their order, each with its sentence's key. */
const STATES = [
  ['live', 'live'],
  ['ageing', 'ageing'],
  ['estimated', 'estimated'],
  ['timetable-only', 'timetableOnly'],
  ['no-signal', 'noSignal'],
] as const

const PLACEHOLDERS = /(\{\w+\})/
const PLACEHOLDER = /^\{(\w+)\}$/

/** Fills each `{name}` in `template` with its part, which may be an element such as a link. */
function compose(template: string, parts: Record<string, ReactNode>): ReactNode[] {
  return template.split(PLACEHOLDERS).map((piece, i) => {
    const name = PLACEHOLDER.exec(piece)?.[1]
    return name !== undefined && name in parts ? <Fragment key={i}>{parts[name]}</Fragment> : piece
  })
}

const days = new Map<Lang, Intl.DateTimeFormat>()

/** A date such as `2026-10-12` as the language writes it: "12 October", "12. oktober". */
function dayOf(date: string, lang: Lang): string {
  let format = days.get(lang)
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(lang), {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    })
    days.set(lang, format)
  }
  return format.format(Date.parse(`${date}T00:00:00Z`))
}

/** A poll interval in seconds as the budget line says it: "90 s", "2 min". */
/** Where the page's vehicles come from. */
function sourceOf({ source }: Snapshot, words: Words['status']): string {
  const name = source.name ?? ''
  if (source.kind === 'simulated') return words.simulated.replace('{name}', name)
  if (source.kind === 'recording') return words.recording.replace('{name}', name)
  return words.rejseplanen
}

/** The disruption list's last check, as the status says it. */
function disruptionsOf(snapshot: Snapshot, timezone: string, words: Words['status']): string {
  const list = snapshot.disruptions
  if (!list) return words.notChecked
  if (list.ok) return words.checked.replace('{time}', clockTime(list.checked, timezone))
  // A failed check gives the time of the last good one, as the Disruptions footer does.
  if (list.fetched === null) return words.firstCheckFailed
  return words.checkFailed.replace('{time}', clockTime(list.fetched, timezone))
}

/** The page's status from the snapshot (docs/screens.md, "The About dialog"). */
function PageStatus({ snapshot }: { snapshot: Snapshot | undefined }) {
  const { lang, dictionary } = useI18n()
  const words = dictionary.about
  const timezone = timezoneOf(useNetwork(snapshot?.timetableVersion))
  const status = words.status
  if (!snapshot) return <FactList items={[{ label: status.source }]} />
  const { budget } = snapshot
  const apiTime = snapshot.apiTime ? Date.parse(snapshot.apiTime) : Number.NaN
  const notes: string[] = []
  if (snapshot.source.kind !== 'rejseplanen') notes.push(status.notReal)
  if (budget.level === 'spent' && budget.resumes) {
    notes.push(status.paused.replace('{date}', dayOf(budget.resumes, lang)))
  } else {
    const line = budgetLine(snapshot, dictionary)
    if (line) notes.push(line)
  }
  return (
    <>
      {notes.map((note) => (
        <Text key={note} render={<p />}>
          {note}
        </Text>
      ))}
      <FactList
        items={[
          { label: status.source, value: sourceOf(snapshot, status) },
          { label: status.positions, value: status.positionModes[snapshot.positionMode] },
          {
            label: status.apiTime,
            value: Number.isNaN(apiTime)
              ? undefined
              : clockTime(apiTime, timezone, { seconds: true }),
          },
          {
            label: status.updates,
            value: status.every.replace(
              '{interval}',
              intervalOf(snapshot.pollInterval, dictionary.vehicle),
            ),
          },
          { label: status.budget, value: status.budgetLevels[budget.level] },
          {
            label: status.calls,
            value: budget.calls.toLocaleString(intlLocale(lang)),
          },
          {
            label: status.store,
            value: snapshot.store === 'ok' ? status.storeOk : status.storeUnavailable,
          },
          { label: status.disruptions, value: disruptionsOf(snapshot, timezone, status) },
        ]}
      />
    </>
  )
}

/** On close, the focus goes back to what opened the dialog, the About button or the credit. */
const returnFocus = () => aboutDialog.opener() ?? true

/**
 * The About dialog (docs/screens.md, "The About dialog"), opened from the top bar's About button
 * and the corner credit's Rejseplanen link: what Mylder is, the full terms and credits, the data
 * states' sentences, the page's status and the keys.
 */
export function AboutDialog() {
  const { lang, dictionary } = useI18n()
  const open = useAboutOpen()
  const snapshot = useSnapshot()
  const words = dictionary.about
  const prepared = snapshot?.status.timetable.prepared
  return (
    <Dialog
      title={words.title}
      description={words.description}
      open={open}
      onClose={() => aboutDialog.close()}
      finalFocus={returnFocus}
    >
      <div className={styles.body}>
        <Text render={<p />}>{words.honest}</Text>
        <Text render={<p />}>{words.nonCommercial}</Text>
        <Section title={words.credits.title}>
          <Text render={<p />}>
            {compose(words.credits.transit, {
              rejseplanen: <Link href={REJSEPLANEN}>Rejseplanen</Link>,
              licence: <Link href={CC_BY}>CC BY 4.0</Link>,
              date: prepared ? dayOf(prepared, lang) : '—',
            })}
          </Text>
          <Text render={<p />}>
            {compose(words.credits.map, {
              openStreetMap: <Link href={OPENSTREETMAP}>{dictionary.credit.openStreetMap}</Link>,
              odbl: <Link href={ODBL}>ODbL</Link>,
              openMapTiles: <Link href={OPENMAPTILES}>OpenMapTiles</Link>,
              openFreeMap: <Link href={OPENFREEMAP}>OpenFreeMap</Link>,
            })}
          </Text>
          <Text render={<p />} emphasis="secondary">
            {compose(words.credits.style, {
              licence: <Link href={MAP_STYLE_LICENCE}>{words.credits.styleLicence}</Link>,
            })}
          </Text>
        </Section>
        <Section title={words.states.title}>
          <ul className={styles.states}>
            {STATES.map(([state, key]) => (
              <li key={state}>
                <VehicleDotLabel variant={state} /> <Text>{words.states[key]}</Text>
              </li>
            ))}
          </ul>
          {snapshot?.positionMode === 'CALC_REPORT' ? (
            <Text render={<p />}>{dictionary.legend.noLive}</Text>
          ) : null}
        </Section>
        <Section title={words.status.title}>
          <PageStatus snapshot={snapshot} />
        </Section>
        <Section title={words.keys.title}>
          <ul className={styles.keys}>
            <li>
              <Text>{compose(words.keys.zoom, { plus: <Kbd>+</Kbd>, minus: <Kbd>−</Kbd> })}</Text>
            </li>
            <li>
              <Text>
                {compose(words.keys.pan, {
                  left: <Kbd>←</Kbd>,
                  right: <Kbd>→</Kbd>,
                  up: <Kbd>↑</Kbd>,
                  down: <Kbd>↓</Kbd>,
                })}
              </Text>
            </li>
            <li>
              <Text>{compose(words.keys.close, { esc: <Kbd>Esc</Kbd> })}</Text>
            </li>
            <li>
              <Text>{words.keys.pause}</Text>
            </li>
          </ul>
        </Section>
      </div>
    </Dialog>
  )
}
