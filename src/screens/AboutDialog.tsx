'use client'

import { Dialog, FactList, Kbd, Link, Section, Text, VehicleDotLabel } from '@mylder/perron'
import type { ClientDictionary } from '../i18n/dictionary'
import { intlLocale } from '../i18n/lang'
import { useI18n } from '../i18n/useI18n'
import { useAircraftProvider } from '../map/aircraft'
import { useSnapshot } from '../map/live'
import { timezoneOf, useNetwork } from '../map/timetable'
import { clockTime } from '../timetable/time'
import type { Snapshot } from '../tracker/index'
import { aboutDialog, useAboutOpen } from './about'
import { budgetLine, intervalOf } from './budget'
import styles from './AboutDialog.module.css'
import { compose } from './compose'
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

/** Where the page's vehicles come from. */
function sourceOf({ source }: Snapshot, { about, onTimetable }: ClientDictionary): string {
  const name = source.name ?? ''
  if (source.kind === 'simulated') return about.status.simulated.replace('{name}', name)
  if (source.kind === 'recording') return about.status.recording.replace('{name}', name)
  if (source.kind === 'timetable') return onTimetable.source
  return about.status.rejseplanen
}

/**
 * What the page says of its vehicles when they aren't Rejseplanen's live data: on the timetable
 * source that they are the timetable's plan, on a simulation or a recording that they aren't real.
 */
function sourceNoteOf({ source }: Snapshot, { about, onTimetable }: ClientDictionary) {
  if (source.kind === 'rejseplanen') return undefined
  return source.kind === 'timetable' ? onTimetable.note : about.status.notReal
}

/**
 * The disruption list's last check, as the status says it; on the timetable source, which asks
 * Rejseplanen nothing, that the messages aren't connected yet.
 */
function disruptionsOf(snapshot: Snapshot, timezone: string, dictionary: ClientDictionary): string {
  const words = dictionary.about.status
  if (snapshot.source.kind === 'timetable') return dictionary.timetableOverview.disruptionsFact
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
  // On the timetable source no realtime is asked for, so the credit names the timetable alone.
  const onTimetable = snapshot?.source.kind === 'timetable'
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
            {compose(onTimetable ? dictionary.onTimetable.transit : words.credits.transit, {
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
          {onTimetable ? <Text render={<p />}>{dictionary.onTimetable.legend}</Text> : null}
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
