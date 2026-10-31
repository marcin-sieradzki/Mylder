'use client'

import { Button, EmptyState, LineBadge, Section, Text } from '@mylder/perron'
import {
  DepartureRow,
  DetailPanel,
  SourceLine,
  type SourceLineSource,
} from '@mylder/perron/patterns'
import { useId, useState } from 'react'
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
import type {
  AnswerSource,
  StandingTrip,
  StopDeparture,
  StopDepartures,
  StopInterval,
} from '../tracker/index'
import type { PanelFrame } from './DetailPanels'
import { badgeLine, departureState, departureTimes } from './departureRow'
import { OpenTrip } from './OpenTrip'
import { Messages } from './Messages'
import styles from './StopPanel.module.css'
import { useServerSecond } from './useServerSecond'
import { fill } from './vehicleLabel'

type Words = ClientDictionary['stop']

/** The most departures the list shows; the answer keeps as many of each mode for the filters. */
const SHOWN_DEPARTURES = 30

/** The most standing trips the section shows until "Show all" (docs/screens.md, "Stop panel"). */
const SHOWN_STANDING = 4

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
 * The stop panel (docs/screens.md): the stop's name and lines, the trips standing at its platforms
 * now, its departures in the next 30 minutes across its platforms, both in the modes the filters
 * show, and where their times came from. Its title names the stop from the timetable while the
 * answer is on its way.
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
 * The trips standing at the stop's platforms, then its messages, then its departures in the modes
 * the filters show, the interval lines' first and the rest aged by the server's clock, then the
 * note and the source line.
 */
function Departures({ answer, timezone, lang, words }: DeparturesProps) {
  const hidden = useHiddenModes()
  const states = useDataStates()
  const now = useServerSecond(useClockOffset())
  const intervals = answer.intervals.filter((row) => !hidden.has(row.mode))
  const shown = answer.departures.filter((row) => !hidden.has(row.mode)).slice(0, SHOWN_DEPARTURES)
  return (
    <>
      <Standing
        // A new stop opens with its standing trips folded again.
        key={answer.stop.id}
        trips={answer.standing.filter((trip) => !hidden.has(trip.mode))}
        source={answer.source}
        states={states}
        now={now}
        timezone={timezone}
        words={words}
      />
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
              label: words.departuresAt,
              time: clockTime(answer.source.at, timezone, { seconds: true }),
              outOfDate: now - answer.source.at > BOARD_FRESH_FOR,
            },
          ]}
        />
      ) : (
        <SourceLine sources={[timetableSource(answer, timezone, words)]} />
      )}
    </>
  )
}

/**
 * The timetable's source, named by its phrase alone: "Timetable and positions 08:14:05", the
 * positions' time of the snapshot its times were shifted by.
 */
const timetableSource = (
  answer: StopDepartures,
  timezone: string,
  words: Words,
): SourceLineSource => ({
  label: words.timetableAndPositions,
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
      <p className={styles.note}>{words.intervalNote}</p>
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

/** One departure: Perron's row, with the times its state shows. */
function Departure({ row, state, now, timezone, words }: DepartureProps) {
  const times = departureTimes(row, state, now, timezone)
  const cancelled = row.cancelled === true
  return (
    <li className={styles.departure}>
      <OpenTrip departure={row} />
      <DepartureRow
        variant={state}
        line={badgeLine(row.colour, row.mode)}
        lineName={row.line}
        destination={row.headsign}
        countdown={times.countdown}
        time={times.time}
        {...(times.expected === undefined ? {} : { expected: times.expected })}
        cancelled={cancelled}
        {...(times.delay === undefined ? {} : { delay: times.delay })}
        {...platformOf(row, words)}
      />
    </li>
  )
}

/** A row's track or stand, as DepartureRow's `platform` takes it, when its board gave one. */
const platformOf = (
  row: Pick<StopDeparture, 'mode' | 'track'>,
  words: Words,
): { platform?: string } =>
  row.track === undefined
    ? {}
    : { platform: fill(ON_TRACKS.has(row.mode) ? words.track : words.stand, { track: row.track }) }

interface StandingProps {
  /** The trips standing at the stop's platforms in the modes the filters show, as answered. */
  trips: readonly StandingTrip[]
  source: AnswerSource
  states: ReadonlyMap<string, DataState>
  now: number
  timezone: string
  words: Words
}

/**
 * "At the platforms now" (docs/screens.md, "Stop panel"): the trips standing at the stop's
 * platforms, soonest to leave first, 4 of them until "Show all" shows the rest, or words saying
 * none stands. Each opens its vehicle.
 */
function Standing({ trips, source, states, now, timezone, words }: StandingProps) {
  const [all, setAll] = useState(false)
  const list = useId()
  const folds = trips.length > SHOWN_STANDING
  const shown = folds && !all ? trips.slice(0, SHOWN_STANDING) : trips
  return (
    <Section
      title={words.standing}
      action={
        folds ? (
          <Button
            variant="outline"
            size="small"
            aria-expanded={all}
            aria-controls={list}
            onClick={() => setAll(!all)}
          >
            {all ? words.showFewer : fill(words.showAll, { count: trips.length })}
          </Button>
        ) : undefined
      }
    >
      {trips.length === 0 ? (
        <Text variant="body-sm" emphasis="secondary">
          {words.standingNone}
        </Text>
      ) : (
        <ul id={list} className={styles.departures} aria-label={words.standing}>
          {shown.map((trip) => (
            <StandingRow
              key={`${trip.trip} ${trip.platform}`}
              trip={trip}
              state={departureState(trip, source, states.get(trip.trip))}
              now={now}
              timezone={timezone}
              words={words}
            />
          ))}
        </ul>
      )}
    </Section>
  )
}

interface StandingRowProps {
  trip: StandingTrip
  state: DataState
  now: number
  timezone: string
  words: Words
}

/**
 * One standing trip: Perron's row, with the time it leaves as its state shows it, or "Ends here"
 * for a trip that ends at the stop, which no source says when it leaves.
 */
function StandingRow({ trip, state, now, timezone, words }: StandingRowProps) {
  const times =
    trip.scheduled === undefined
      ? undefined
      : departureTimes({ scheduled: trip.scheduled, expected: trip.expected }, state, now, timezone)
  return (
    <li className={styles.departure}>
      <OpenTrip departure={trip} />
      <DepartureRow
        variant={state}
        line={badgeLine(trip.colour, trip.mode)}
        lineName={trip.line}
        destination={trip.ends ? words.endsHere : trip.headsign}
        {...(times === undefined
          ? {}
          : {
              countdown: times.countdown,
              time: times.time,
              ...(times.expected === undefined ? {} : { expected: times.expected }),
              ...(times.delay === undefined ? {} : { delay: times.delay }),
            })}
        {...platformOf(trip, words)}
      />
    </li>
  )
}
