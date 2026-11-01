'use client'

import { Dialog, FactList, Kbd, Link, Section, Text, VehicleDotLabel } from '@mylder/perron'
import { describeSource } from '../domain/source'
import type { ClientDictionary } from '../i18n/dictionary'
import { intlLocale } from '../i18n/lang'
import { useI18n } from '../i18n/useI18n'
import { useAircraftProvider } from '../map/aircraft'
import { useSnapshot, useSource } from '../map/live'
import { timezoneOf, useNetwork } from '../map/timetable'
import { clockTime } from '../timetable/time'
import type { Snapshot } from '../tracker/index'
import { aboutDialog, useAboutOpen } from './about'
import { budgetLine, intervalOf } from './budget'
import styles from './AboutDialog.module.css'
import { compose } from './compose'
import { sourceWords } from './sourceWords'
import {
  aircraftCredit,
  CC_BY,
  MAP_STYLE_LICENCE,
  ODBL,
  OPENFREEMAP,
  OPENMAPTILES,
  OPENSTREETMAP,
  RECORDINGS,
  REJSEPLANEN,
} from './credits'
import { dayOf } from './wording'

type Words = ClientDictionary['about']

/** The five data states in their order, each with its sentence's key. */
const STATES = [
  ['live', 'live'],
  ['ageing', 'ageing'],
  ['estimated', 'estimated'],
  ['timetable-only', 'timetableOnly'],
  ['no-signal', 'noSignal'],
] as const

/** Where the page's vehicles come from, by the source's name and its scenario or recording. */
function sourceOf({ source }: Snapshot, dictionary: ClientDictionary): string {
  const { named } = describeSource(source.kind)
  return sourceWords(dictionary, named).replace('{name}', source.name ?? '')
}

/**
 * What the page says of its vehicles when they aren't Rejseplanen's live data: on the timetable
 * source that they are the timetable's plan, on a simulation or a recording that they aren't real.
 */
function sourceNoteOf({ source }: Snapshot, dictionary: ClientDictionary) {
  const { note } = describeSource(source.kind)
  return note && sourceWords(dictionary, note)
}

/**
 * The disruption list's last check, as the status says it; on a source that brings no messages,
 * such as the timetable, that the messages aren't connected yet.
 */
function disruptionsOf(snapshot: Snapshot, timezone: string, dictionary: ClientDictionary): string {
  const words = dictionary.about.status
  if (!describeSource(snapshot.source.kind).messages) return dictionary.onTimetable.notConnected
  const list = snapshot.disruptions
  if (!list) return words.notChecked
  if (list.ok) return words.checked.replace('{time}', clockTime(list.checked, timezone))
  // A failed check gives the time of the last good one, as the Disruptions footer does.
  if (list.fetched === null) return words.firstCheckFailed
  return words.checkFailed.replace('{time}', clockTime(list.fetched, timezone))
}

/**
 * Rejseplanen's own realtime time, as the status gives it; on a source that asks Rejseplanen
 * nothing, such as the timetable, that its realtime isn't connected yet rather than that the time
 * is unknown.
 */
function apiTimeOf(snapshot: Snapshot, timezone: string, dictionary: ClientDictionary) {
  if (!describeSource(snapshot.source.kind).callsRejseplanen) {
    return dictionary.onTimetable.notConnected
  }
  const apiTime = snapshot.apiTime ? Date.parse(snapshot.apiTime) : Number.NaN
  return Number.isNaN(apiTime) ? undefined : clockTime(apiTime, timezone, { seconds: true })
}

/** The page's status from the snapshot (docs/screens.md, "The About dialog"). */
function PageStatus({ snapshot }: { snapshot: Snapshot | undefined }) {
  const { lang, dictionary } = useI18n()
  const words = dictionary.about
  const timezone = timezoneOf(useNetwork(snapshot?.timetableVersion))
  const status = words.status
  if (!snapshot) return <FactList items={[{ label: status.source }]} />
  const { budget } = snapshot
  const notes: string[] = []
  const sourceNote = sourceNoteOf(snapshot, dictionary)
  if (sourceNote) notes.push(sourceNote)
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
          { label: status.source, value: sourceOf(snapshot, dictionary) },
          { label: status.positions, value: status.positionModes[snapshot.positionMode] },
          { label: status.apiTime, value: apiTimeOf(snapshot, timezone, dictionary) },
          {
            label: status.updates,
            value: status.every.replace(
              '{interval}',
              intervalOf(snapshot.pollInterval, dictionary.interval),
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
          { label: status.disruptions, value: disruptionsOf(snapshot, timezone, dictionary) },
        ]}
      />
    </>
  )
}

/** The aircraft's credit for the provider that answered, beside the map's; none without any. */
function AircraftCredit({ words }: { words: Words['credits'] }) {
  const { dictionary } = useI18n()
  const provider = useAircraftProvider()
  if (!provider) return null
  const credit = aircraftCredit(provider)
  const contributors = dictionary.credit.contributors.replace('{name}', credit.name)
  return (
    <Text render={<p />}>
      {credit.odbl
        ? compose(words.aircraft, {
            source: <Link href={credit.href}>{contributors}</Link>,
            licence: <Link href={ODBL}>ODbL</Link>,
          })
        : compose(words.aircraftFrom, {
            source: <Link href={credit.href}>{credit.name}</Link>,
          })}
    </Text>
  )
}

/**
 * For planes replayed from a recording, as in the demo: that they are recorded adsb.lol data, and
 * where the recording is open under the same licence.
 */
function RecordedAircraft({ words }: { words: Words['credits'] }) {
  if (useAircraftProvider() !== 'recording') return null
  return (
    <Text render={<p />}>
      {compose(words.recording, {
        recordings: <Link href={RECORDINGS}>{words.recordings}</Link>,
      })}
    </Text>
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
  const source = useSource()
  // Credited to the timetable alone on the timetable source, which asks for no realtime.
  const transit =
    source?.credit === 'timetable' ? dictionary.onTimetable.transit : words.credits.transit
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
            {compose(transit, {
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
          <Text render={<p />}>{words.credits.buildings}</Text>
          <AircraftCredit words={words.credits} />
          <RecordedAircraft words={words.credits} />
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
          {source?.legend ? (
            <Text render={<p />}>{sourceWords(dictionary, source.legend)}</Text>
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
              <Text>
                {compose(words.keys.turn, {
                  shift: <Kbd>{words.keys.shift}</Kbd>,
                  left: <Kbd>←</Kbd>,
                  right: <Kbd>→</Kbd>,
                })}
              </Text>
            </li>
            <li>
              <Text>
                {compose(words.keys.tilt, {
                  shift: <Kbd>{words.keys.shift}</Kbd>,
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
