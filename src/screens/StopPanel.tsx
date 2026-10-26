'use client'

import { EmptyState, LineBadge, Text } from '@mylder/perron'
import { DepartureRow, DetailPanel, SourceLine } from '@mylder/perron/patterns'
import type { DataState } from '../domain/data-state'
import type { ClientDictionary } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import { useClockOffset, useSnapshot } from '../map/live'
import type { PanelStateOf } from '../map/panels'
import { useDataStates } from '../map/states'
import { timezoneOf, useNetwork } from '../map/timetable'
import { useHiddenModes } from '../map/view'
import { clockTime } from '../timetable/time'
import type { StopDeparture, StopDepartures } from '../tracker/index'
import type { PanelFrame } from './DetailPanels'
import { badgeLine, departureTimes } from './departureRow'
import styles from './StopPanel.module.css'
import { useServerSecond } from './useServerSecond'

type Words = ClientDictionary['stop']

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
  const { dictionary } = useI18n()
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
        <Departures answer={answer} timezone={timezoneOf(network)} words={words} />
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
  words: Words
}

/** The departures, aged by the server's clock, then the note and the source line. */
function Departures({ answer, timezone, words }: DeparturesProps) {
  const hidden = useHiddenModes()
  const states = useDataStates()
  const now = useServerSecond(useClockOffset())
  const shown = answer.departures.filter((row) => !hidden.has(row.mode))
  return (
    <>
      {shown.length === 0 ? (
        <Text variant="body-sm" emphasis="secondary">
          {words.empty}
        </Text>
      ) : (
        <ul className={styles.departures} aria-label={words.departures}>
          {shown.map((row) => (
            <Departure
              key={`${row.trip} ${row.platform}`}
              row={row}
              // The trip's state now, by the clock, where the page's snapshot carries it.
              state={states.get(row.trip) ?? row.state}
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
      <SourceLine
        sources={[
          {
            name: words.timetableAndPositions,
            time: clockTime(answer.fetched, timezone, { seconds: true }),
          },
        ]}
      />
    </>
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
      <DepartureRow
        variant={state}
        line={badgeLine(row.colour, row.mode)}
        lineName={row.line}
        destination={row.headsign}
        countdown={times.countdown}
        cancelled={cancelled}
        {...(times.delay === undefined ? {} : { delay: times.delay })}
        {...(row.track === undefined ? {} : { platform: row.track })}
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
