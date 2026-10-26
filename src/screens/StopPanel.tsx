'use client'

import { EmptyState, LineBadge, Text } from '@mylder/perron'
import {
  DepartureRow,
  DetailPanel,
  SourceLine,
  type SourceLineSource,
} from '@mylder/perron/patterns'
import type { DataState } from '../domain/data-state'
import type { ClientDictionary } from '../i18n/dictionary'
import type { Lang } from '../i18n/lang'
import { useI18n } from '../i18n/useI18n'
import { useClockOffset, useSnapshot } from '../map/live'
import type { PanelStateOf } from '../map/panels'
import { useDataStates } from '../map/states'
import { timezoneOf, useNetwork } from '../map/timetable'
import { useHiddenModes } from '../map/view'
import { clockTime } from '../timetable/time'
import type { StopDeparture, StopDepartures, StopInterval } from '../tracker/index'
import type { PanelFrame } from './DetailPanels'
import { badgeLine, departureState, departureTimes } from './departureRow'
import { OpenTrip } from './OpenTrip'
import { Messages } from './Messages'
import styles from './StopPanel.module.css'
import { useServerSecond } from './useServerSecond'

type Words = ClientDictionary['stop']

/** The most departures the list shows; the answer keeps as many of each mode for the filters. */
const SHOWN_DEPARTURES = 30

/** A board answer older than this may be out of date (docs/screens.md, "Sources and times"). */
const BOARD_FRESH_FOR = 60_000

/** The modes whose platforms are tracks; a bus leaves from a stand. */
const ON_TRACKS: ReadonlySet<StopDeparture['mode']> = new Set([
  'metro',
  's-tog',
  'train',
  'light-rail',
])

export interface StopPanelProps {
  /** The open stop and its answer, as the panel answers give it. */
  state: PanelStateOf<'stop'>
  /** Where the panel sits and how it closes, as every detail panel's. */
  frame: PanelFrame
}

/**
 * Stop departures (docs/screens.md): the stop's name and lines, its departures in the next 30
 * minutes across its platforms in the modes the filters show, and where their times came from.
 * Its title names the stop from the timetable while the answer is on its way.
 */
export function StopPanel({ state, frame }: StopPanelProps) {
  const { dictionary, lang } = useI18n()
  const words = dictionary.stop
  const network = useNetwork(useSnapshot()?.timetableVersion)
  const { answer, status } = state
  const named = network?.stops.stops.find((stop) => stop.id === state.panel.id)?.name
  const title =
    status === 'not-found' ? words.notFound : (answer?.stop.name ?? named ?? words.fallbackTitle)
  const lines = answer?.stop.lines ?? []
  return (
    <DetailPanel
      {...frame}
      open
      variant="stop"
      title={title}
      line={lines.length === 1 ? badgeLine(lines[0].colour, lines[0].mode) : undefined}
      subheader={
        lines.length === 0 ? undefined : (
          <ul className={styles.lines} aria-label={words.lines}>
            {lines.map((line) => (
              <li key={`${line.mode} ${line.name}`}>
                <LineBadge line={badgeLine(line.colour, line.mode)}>{line.name}</LineBadge>
              </li>
            ))}
          </ul>
        )
      }
    >
      {answer ? (
        <Departures answer={answer} timezone={timezoneOf(network)} lang={lang} words={words} />
      ) : (
        <Pending status={status} words={words} />
      )}
    </DetailPanel>
  )
}

/** What the panel shows before it has an answer: on its way, not found, or failed. */
function Pending({ status, words }: { status: PanelStateOf<'stop'>['status']; words: Words }) {
  switch (status) {
    case 'not-found':
      return <EmptyState title={words.notFound}>{words.notFoundDetail}</EmptyState>
    case 'error':
      return <EmptyState title={words.failed}>{words.failedDetail}</EmptyState>
    default:
      return (
        <Text variant="body-sm" emphasis="secondary" render={<output />}>
          {words.loading}
        </Text>
      )
  }
}

interface DeparturesProps {
  answer: StopDepartures
  timezone: string
  lang: Lang
  words: Words
}

/**
 * The stop's messages, then its departures in the modes the filters show, the interval lines'
 * first and the rest aged by the server's clock, then the note and the source line.
 */
function Departures({ answer, timezone, lang, words }: DeparturesProps) {
  const hidden = useHiddenModes()
  const states = useDataStates()
  const now = useServerSecond(useClockOffset())
  const intervals = answer.intervals.filter((row) => !hidden.has(row.mode))
  const shown = answer.departures.filter((row) => !hidden.has(row.mode)).slice(0, SHOWN_DEPARTURES)
  return (
    <>
      <Messages
        messages={answer.messages}
        now={now}
        lang={lang}
        timezone={timezone}
        words={words}
        source={words.messagesSource}
      />
      {shown.length + intervals.length === 0 ? (
        <Text variant="body-sm" emphasis="secondary">
          {words.empty}
        </Text>
      ) : (
        <ul className={styles.departures} aria-label={words.departures}>
          {intervals.map((row) => (
            <Interval key={`${row.line} ${row.headsign} ${row.platform}`} row={row} words={words} />
          ))}
          {shown.map((row) => (
            <Departure
              key={`${row.trip} ${row.platform} ${row.scheduled}`}
              row={row}
              state={departureState(row, answer.source, states.get(row.trip))}
              now={now}
              timezone={timezone}
              words={words}
            />
          ))}
        </ul>
      )}
      <Text variant="caption" emphasis="secondary">
        {words.note}
      </Text>
      {answer.source.kind === 'timetable' ? (
        <Text variant="caption" emphasis="secondary">
          {words.fromTimetable}
        </Text>
      ) : null}
      {answer.source.kind === 'rejseplanen' ? (
        <SourceLine
          sources={[
            {
              name: 'Rejseplanen',
              time: clockTime(answer.source.at, timezone, { seconds: true }),
              outOfDate: now - answer.source.at > BOARD_FRESH_FOR,
            },
          ]}
          sourceUpdatedLabel={words.departuresAt}
          sourceOutOfDateLabel={words.departuresOutOfDate}
        />
      ) : (
        <SourceLine sources={[timetableSource(answer, timezone, words)]} />
      )}
    </>
  )
}

/** The timetable's source: the positions' time of the snapshot its times were shifted by. */
const timetableSource = (
  answer: StopDepartures,
  timezone: string,
  words: Words,
): SourceLineSource => ({
  name: words.timetableAndPositions,
  time: clockTime(answer.fetched, timezone, { seconds: true }),
})

/** An interval line in one direction: Perron's row in its interval form, and the note under it. */
function Interval({ row, words }: { row: StopInterval; words: Words }) {
  const { every } = row
  return (
    <li className={styles.departure}>
      <DepartureRow
        variant="timetable-only"
        line={badgeLine(row.colour, row.mode)}
        lineName={row.line}
        destination={row.headsign}
        // No interval to tell shows "—".
        interval={
          every === undefined
            ? Number.NaN
            : every.from === every.to
              ? every.from
              : [every.from, every.to]
        }
      />
      <p className={styles.times}>{words.intervalNote}</p>
    </li>
  )
}

interface DepartureProps {
  row: StopDeparture
  state: DataState
  now: number
  timezone: string
  words: Words
}

/** One departure: Perron's row, with the time the state shows under it until the row has one. */
function Departure({ row, state, now, timezone, words }: DepartureProps) {
  const times = departureTimes(row, state, now, timezone)
  const cancelled = row.cancelled === true
  return (
    <li className={styles.departure} data-cancelled={cancelled ? '' : undefined}>
      <OpenTrip departure={row} />
      <DepartureRow
        variant={state}
        line={badgeLine(row.colour, row.mode)}
        lineName={row.line}
        destination={row.headsign}
        countdown={times.countdown}
        cancelled={cancelled}
        {...(times.delay === undefined ? {} : { delay: times.delay })}
        {...(row.track === undefined
          ? {}
          : {
              platform: (ON_TRACKS.has(row.mode) ? words.track : words.stand).replace(
                '{track}',
                row.track,
              ),
            })}
      />
      <p className={styles.times}>
        {times.struck === undefined ? null : (
          <>
            <span className={styles.hidden}>{words.timetabled} </span>
            <time className={styles.struck} dateTime={times.struck}>
              {times.struck}
            </time>
          </>
        )}
        <time dateTime={times.time}>{times.estimate ? `~${times.time}` : times.time}</time>
        {times.unknown ? <span>{words.unknown}</span> : null}
      </p>
    </li>
  )
}
