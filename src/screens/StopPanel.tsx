'use client'

import {
  Button,
  EmptyState,
  LineBadge,
  Section,
  Surface,
  Tab,
  Tabs,
  TabsList,
  TabsPanel,
  Text,
} from '@mylder/perron'
import {
  DepartureRow,
  DetailPanel,
  SourceLine,
  type SourceLineSource,
} from '@mylder/perron/patterns'
import { useId, useState, type Ref } from 'react'
import type { DataState } from '../domain/data-state'
import type { ClientDictionary } from '../i18n/dictionary'
import type { Lang } from '../i18n/lang'
import { useI18n } from '../i18n/useI18n'
import { useKnownClockOffset, useSnapshot } from '../map/live'
import { useStopArrivals, type PanelStateOf, type PanelStatus } from '../map/panels'
import { useDataStates } from '../map/states'
import { timezoneOf, useNetwork } from '../map/timetable'
import {
  isStopBoard,
  mapView,
  STOP_BOARDS,
  useHiddenModes,
  useStopBoard,
  type StopBoard,
} from '../map/view'
import type { Mode } from '../timetable/format'
import { clockTime } from '../timetable/time'
import type {
  AnswerSource,
  Disruption,
  StandingTrip,
  StopDeparture,
  StopInterval,
} from '../tracker/index'
import type { PanelFrame } from './DetailPanels'
import { badgeLine, departureState, departureTimes } from './departureRow'
import { OpenTrip } from './OpenTrip'
import { Messages } from './Messages'
import styles from './StopPanel.module.css'
import { usePeekTo, type PeekTo } from './usePeekTo'
import { useServerSecond } from './useServerSecond'
import { fill } from './vehicleLabel'

type Words = ClientDictionary['stop']

/** The most departures the list shows; the answer keeps as many of each mode for the filters. */
const SHOWN_DEPARTURES = 30

/** The most standing trips the section shows until "Show all" (docs/screens.md, "Stop panel"). */
const SHOWN_STANDING = 4

/**
 * How long past its minute a board answer may be before its source line says so: room for the
 * panel to bring the next, so the line doesn't flash the warning while that is on its way. The
 * panel asks up to 4 s after an answer falls due, and when the CDN still has the old one, again
 * 5 s and up to 4 s later (src/map/panels.ts), each ask taking a moment.
 */
export const BOARD_GRACE = 20_000

/** A board answer older than this may be out of date (docs/screens.md, "Sources and times"). */
const BOARD_FRESH_FOR = 60_000 + BOARD_GRACE

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
 * now, then its departures and its arrivals in the next 30 minutes across its platforms as two
 * tabs, all in the modes the filters show, each list with where its times came from. Its title
 * names the stop from the timetable while the answer is on its way.
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
  const phone = frame.anchor === 'bottom'
  // On a phone the sheet's peek ends under the tabs, so the rider sees them below the standing row.
  const { snapPoints, popup, content, above, until } = usePeekTo(phone)
  return (
    <DetailPanel
      {...frame}
      ref={popup}
      slotProps={{ ...frame.slotProps, content: { ref: content } }}
      snapPoints={snapPoints}
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
      {status === 'not-found' ? (
        <EmptyState title={words.notFound}>{words.notFoundDetail}</EmptyState>
      ) : (
        <StopLists
          state={state}
          timezone={timezoneOf(network)}
          lang={lang}
          words={words}
          phone={phone}
          above={above}
          until={until}
        />
      )}
    </DetailPanel>
  )
}

/** What a list's tab shows before it has an answer: on its way, not found, or failed. */
function Pending({ status, loading, failed, words }: PendingProps) {
  switch (status) {
    case 'not-found':
      return <EmptyState title={words.notFound}>{words.notFoundDetail}</EmptyState>
    case 'error':
      return <EmptyState title={failed}>{words.failedDetail}</EmptyState>
    default:
      return (
        <Text variant="body-sm" emphasis="secondary" render={<output />}>
          {loading}
        </Text>
      )
  }
}

interface PendingProps {
  status: PanelStatus
  /** What it says while the answer is on its way, and when it failed. */
  loading: string
  failed: string
  words: Words
}

/**
 * What the panel's lists read: the filters, the trips' states on the map, the server's second,
 * none until the page knows the server's clock.
 */
interface ListContext {
  readonly hidden: ReadonlySet<Mode>
  readonly states: ReadonlyMap<string, DataState>
  readonly now: number | undefined
  readonly timezone: string
  readonly lang: Lang
  readonly words: Words
}

interface StopListsProps {
  state: PanelStateOf<'stop'>
  timezone: string
  lang: Lang
  words: Words
  /** Whether the panel is a phone's bottom sheet, where the standing trips are a row. */
  phone: boolean
  /** The standing trips' ref, whose height moves the tabs and so the sheet's peek. */
  above: PeekTo['above']
  /** The tabs' ref: a phone's sheet peeks down to their end. */
  until: PeekTo['until']
}

/**
 * The trips standing at the stop's platforms, once its answer is in, then Departures and Arrivals
 * as two tabs following the ARIA tabs pattern, the open one kept in the address. Departures opens
 * first, from the stop's answer; Arrivals asks for its own while it is open.
 */
function StopLists({ state, timezone, lang, words, phone, above, until }: StopListsProps) {
  const hidden = useHiddenModes()
  const states = useDataStates()
  // Until the first snapshot gives the server's clock, this device's could be any distance from it,
  // so nothing counts down or calls an answer old by it.
  const now = useServerSecond(useKnownClockOffset())
  const board = useStopBoard()
  const context: ListContext = { hidden, states, now, timezone, lang, words }
  const { answer, status } = state
  return (
    <>
      {answer ? (
        <Standing
          // A new stop opens with its standing trips folded again.
          key={answer.stop.id}
          trips={answer.standing.filter((trip) => !hidden.has(trip.mode))}
          source={answer.source}
          states={states}
          now={now}
          timezone={timezone}
          words={words}
          phone={phone}
          ref={above}
        />
      ) : null}
      <Tabs
        value={board}
        onChange={(_event, value) => {
          if (isStopBoard(value)) mapView.update({ board: value })
        }}
      >
        <TabsList ref={until} aria-label={words.boards}>
          {STOP_BOARDS.map((value) => (
            <Tab key={value} value={value}>
              {words[value]}
            </Tab>
          ))}
        </TabsList>
        <TabsPanel value="departures" className={styles.board}>
          {answer ? (
            <Board
              board="departures"
              rows={answer.departures}
              intervals={answer.intervals}
              answer={answer}
              {...context}
            />
          ) : (
            <Pending status={status} loading={words.loading} failed={words.failed} words={words} />
          )}
        </TabsPanel>
        <TabsPanel value="arrivals" className={styles.board}>
          <Arrivals {...context} />
        </TabsPanel>
      </Tabs>
    </>
  )
}

/**
 * The Arrivals tab's list, from the stop's arrivals, which are asked for while this shows (the
 * tab's panel is only mounted while it is open) and the address has the stop on Arrivals.
 */
function Arrivals(context: ListContext) {
  const state = useStopArrivals()
  const { words } = context
  if (!state?.answer) {
    return (
      <Pending
        status={state?.status ?? 'loading'}
        loading={words.arrivalsLoading}
        failed={words.arrivalsFailed}
        words={words}
      />
    )
  }
  const { answer } = state
  return (
    <Board
      board="arrivals"
      rows={answer.arrivals}
      intervals={answer.intervals}
      answer={answer}
      {...context}
    />
  )
}

/**
 * Each list's words: its name, its empty text, its note while its times come from the timetable,
 * and its source's label once Rejseplanen answers.
 */
const BOARD_WORDS = {
  departures: { name: 'departures', empty: 'empty', note: 'note', at: 'departuresAt' },
  arrivals: { name: 'arrivals', empty: 'arrivalsEmpty', note: 'arrivalsNote', at: 'arrivalsAt' },
} as const satisfies Record<StopBoard, Record<string, keyof Words>>

/** A row of either list: a departure, or an arrival with where it comes from. */
type BoardRow = StopDeparture & { readonly origin?: string }
type BoardInterval = StopInterval & { readonly origin?: string }

interface BoardProps extends ListContext {
  board: StopBoard
  rows: readonly BoardRow[]
  intervals: readonly BoardInterval[]
  /** Where its times came from, and the messages it brought. */
  answer: {
    readonly source: AnswerSource
    readonly fetched: number
    readonly messages: readonly Disruption[]
  }
}

/**
 * One of the stop's lists: its messages, then its rows in the modes the filters show, the interval
 * lines' first and the rest aged by the server's clock, then the note and the source line. An
 * arrival names where it comes from in place of where it goes. Until the page knows the server's
 * clock, the rows show no countdown, the messages read as at the answer's moment, and the source
 * line never says it may be out of date.
 */
function Board({
  board,
  rows,
  intervals,
  answer,
  hidden,
  states,
  now,
  timezone,
  lang,
  words,
}: BoardProps) {
  const named = BOARD_WORDS[board]
  const shownIntervals = intervals.filter((row) => !hidden.has(row.mode))
  const shown = rows.filter((row) => !hidden.has(row.mode)).slice(0, SHOWN_DEPARTURES)
  const placeOf = (row: BoardRow | BoardInterval) =>
    row.origin === undefined ? row.headsign : fill(words.from, { origin: row.origin })
  return (
    <>
      <Messages
        messages={answer.messages}
        now={now ?? answer.fetched}
        lang={lang}
        timezone={timezone}
        words={words}
        source={words.messagesSource}
      />
      {shown.length + shownIntervals.length === 0 ? (
        <Text variant="body-sm" emphasis="secondary">
          {words[named.empty]}
        </Text>
      ) : (
        <ul className={styles.departures} aria-label={words[named.name]}>
          {shownIntervals.map((row) => (
            <Interval
              key={`${row.line} ${row.headsign} ${row.platform}`}
              row={row}
              place={placeOf(row)}
              words={words}
            />
          ))}
          {shown.map((row) => (
            <Departure
              key={`${row.trip} ${row.platform} ${row.scheduled}`}
              row={row}
              place={placeOf(row)}
              state={departureState(row, answer.source, states.get(row.trip))}
              now={now}
              timezone={timezone}
              words={words}
            />
          ))}
        </ul>
      )}
      <Text variant="caption" emphasis="secondary">
        {/* A board's answer carries Rejseplanen's expected times, whichever list it fills. */}
        {answer.source.kind === 'rejseplanen' ? words.note : words[named.note]}
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
              label: words[named.at],
              time: clockTime(answer.source.at, timezone, { seconds: true }),
              outOfDate: now !== undefined && now - answer.source.at > BOARD_FRESH_FOR,
            },
          ]}
        />
      ) : (
        <SourceLine sources={[timetableSource(answer.fetched, timezone, words)]} />
      )}
    </>
  )
}

/**
 * The timetable's source, named by its phrase alone: "Timetable and positions 08:14:05", the
 * positions' time of the snapshot its times were shifted by.
 */
const timetableSource = (fetched: number, timezone: string, words: Words): SourceLineSource => ({
  label: words.timetableAndPositions,
  time: clockTime(fetched, timezone, { seconds: true }),
})

interface IntervalProps {
  row: StopInterval
  /** Where it goes, or for an arrival where it comes from, as the row names it. */
  place: string
  words: Words
}

/** An interval line in one direction: Perron's row in its interval form, and the note under it. */
function Interval({ row, place, words }: IntervalProps) {
  const { every } = row
  return (
    <li className={styles.departure}>
      <DepartureRow
        variant="timetable-only"
        line={badgeLine(row.colour, row.mode)}
        lineName={row.line}
        destination={place}
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
  row: BoardRow
  /** Where it goes, or for an arrival where it comes from, as the row names it. */
  place: string
  state: DataState
  now: number | undefined
  timezone: string
  words: Words
}

/** One departure or arrival: Perron's row, with the times its state shows. */
function Departure({ row, place, state, now, timezone, words }: DepartureProps) {
  const times = departureTimes(row, state, now, timezone)
  const cancelled = row.cancelled === true
  return (
    <li className={styles.departure}>
      <OpenTrip departure={row} />
      <DepartureRow
        variant={state}
        line={badgeLine(row.colour, row.mode)}
        lineName={row.line}
        destination={place}
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
  now: number | undefined
  timezone: string
  words: Words
  /** Whether the panel is a phone's bottom sheet: every trip shows, as a row that scrolls sideways. */
  phone: boolean
  ref: Ref<HTMLElement>
}

/**
 * "At the platforms now" (docs/screens.md, "Stop panel"): the trips standing at the stop's
 * platforms, soonest to leave first, or words saying none stands. Each opens its vehicle. In a
 * side panel they are a list, 4 of them until "Show all" shows the rest; in a phone's bottom
 * sheet, every one of them as a row of cards the rider swipes through.
 */
function Standing({ trips, source, states, now, timezone, words, phone, ref }: StandingProps) {
  const [all, setAll] = useState(false)
  const list = useId()
  const folds = !phone && trips.length > SHOWN_STANDING
  const shown = folds && !all ? trips.slice(0, SHOWN_STANDING) : trips
  return (
    <Section
      ref={ref}
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
        <ul
          id={list}
          className={phone ? styles.standingRow : styles.departures}
          aria-label={words.standing}
        >
          {shown.map((trip) => (
            <StandingRow
              key={`${trip.trip} ${trip.platform}`}
              trip={trip}
              state={departureState(trip, source, states.get(trip.trip))}
              now={now}
              timezone={timezone}
              words={words}
              card={phone}
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
  now: number | undefined
  timezone: string
  words: Words
  /** Whether it is a card in a phone's row rather than a row of a list. */
  card: boolean
}

/**
 * One standing trip: Perron's row, with the time it leaves as its state shows it, or "Ends here"
 * for a trip that ends at the stop, which no source says when it leaves. In a phone's row it sits
 * on a raised Surface, a card of its own, until Perron has a card for a standing trip
 * (StandingCard, marcin-sieradzki/perron#190), which replaces this stand-in when it lands.
 * perron-stand-in: perron#190
 */
function StandingRow({ trip, state, now, timezone, words, card }: StandingRowProps) {
  const times =
    trip.scheduled === undefined
      ? undefined
      : departureTimes({ scheduled: trip.scheduled, expected: trip.expected }, state, now, timezone)
  const content = (
    <>
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
    </>
  )
  return card ? (
    <Surface variant="raised" className={styles.card} render={<li />}>
      {content}
    </Surface>
  ) : (
    <li className={styles.departure}>{content}</li>
  )
}
