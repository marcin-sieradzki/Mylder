'use client'

import { Delay, EmptyState, FactList, Text, VehicleDotLabel } from '@mylder/perron'
import {
  DetailPanel,
  SourceLine,
  StopTimeline,
  type SourceLineSource,
} from '@mylder/perron/patterns'
import { useEffect, useRef } from 'react'
import type { DataState } from '../domain/data-state'
import { disruptionPhase } from '../domain/disruption'
import type { ClientDictionary } from '../i18n/dictionary'
import type { Lang } from '../i18n/lang'
import { useI18n } from '../i18n/useI18n'
import { followedVehicle } from '../map/follow'
import { useClockOffset, useSnapshot, useSource } from '../map/live'
import type { PanelStateOf } from '../map/panels'
import { useDataState } from '../map/states'
import { openPanel, useHiddenModes } from '../map/view'
import { onMap } from '../map/vehicles'
import { timezoneOf, useNetwork } from '../map/timetable'
import { whereOf } from '../map/where'
import type { Network } from '../timetable/network'
import { clockTime } from '../timetable/time'
import type { Snapshot, SnapshotTrip, TripDetail } from '../tracker/index'
import type { PanelFrame } from './DetailPanels'
import { badgeLine } from './departureRow'
import { Messages } from './Messages'
import { useServerSecond } from './useServerSecond'
import { VehicleActions } from './VehicleActions'
import {
  intervalWords,
  nextCallOf,
  runsToInterval,
  shownDelayOf,
  stateSentence,
  timedCallsOf,
  timelineStops,
  whereWords,
} from './vehicleDetail'
import { fill } from './vehicleLabel'
import styles from './VehiclePanel.module.css'

type Words = ClientDictionary['trip']

export interface VehiclePanelProps {
  /** The open trip and its answer, as the panel answers give it. */
  state: PanelStateOf<'trip'>
  /** Where the panel sits and how it closes, as every detail panel's. */
  frame: PanelFrame
}

/**
 * Vehicle detail (docs/screens.md): the trip's line, destination and mode, what its data state
 * means, its facts, where it is, its stops, its own messages and where their times came from.
 * Its header names the trip from the snapshot while the answer is on its way. The header's action
 * row holds Follow and Show whole line. The panel keeps to the vehicle the viewer opened: when a
 * snapshot files its journey under another trip, as the run does once a trip's detail has
 * corrected the join, the address and Follow move to that trip.
 */
export function VehiclePanel({ state, frame }: VehiclePanelProps) {
  const { dictionary, lang } = useI18n()
  const words = dictionary.trip
  const snapshot = useSnapshot()
  const network = useNetwork(snapshot?.timetableVersion)
  const { answer, status } = state
  const trip = snapshot?.trips.find((each) => each.key === state.panel.id)
  useKeptVehicle(state.panel.id, snapshot)
  const hidden = useHiddenModes()
  const noPositions = useSource()?.positions === false
  const named = answer ?? trip
  // The line's colour from the answer, or from the timetable's pattern before the answer lands.
  const pattern = trip && network?.patterns.patterns[trip.pattern]
  const colour = answer?.colour ?? (pattern ? network.patterns.lines[pattern.line]?.colour : '')
  const title =
    status === 'not-found'
      ? words.notFound
      : named
        ? fill(words.to, { headsign: named.headsign })
        : words.fallbackTitle
  return (
    <DetailPanel
      {...frame}
      open
      variant="line"
      title={title}
      {...(named && status !== 'not-found'
        ? {
            line: badgeLine(colour ?? '', named.mode),
            lineName: named.line,
            subheader: dictionary.modes[named.mode],
            action: (
              <VehicleActions
                tripKey={state.panel.id}
                pattern={answer?.pattern ?? trip?.pattern}
                onMap={trip !== undefined && onMap(trip, hidden)}
                network={network}
              />
            ),
          }
        : {})}
    >
      {answer ? (
        <Detail
          answer={answer}
          trip={trip}
          network={network}
          noPositions={noPositions}
          lang={lang}
          words={words}
        />
      ) : (
        <Pending status={status} words={words} />
      )}
    </DetailPanel>
  )
}

/**
 * Keeps the open panel on the vehicle the viewer opened, by its journey: when a snapshot no longer
 * files that journey under the panel's trip but under another, the address, and Follow if it was
 * on, move to that trip. Only a journey with a number (`ZI@DA`, not `@DA`) is kept to, since only
 * that one tells its vehicle from the rest of its day, as the server's corrections of the join do.
 */
function useKeptVehicle(tripKey: string, snapshot: Snapshot | undefined) {
  const opened = useRef<{ readonly tripKey: string; readonly journey: string }>(undefined)
  useEffect(() => {
    const trips = snapshot?.trips ?? []
    const filed = trips.find((each) => each.key === tripKey)?.journey
    const journey = filed?.startsWith('@') ? undefined : filed
    const kept = opened.current?.tripKey === tripKey ? opened.current.journey : undefined
    const moved =
      kept === undefined || journey === kept
        ? undefined
        : trips.find((each) => each.journey === kept)
    if (kept !== undefined && moved) {
      opened.current = { tripKey: moved.key, journey: kept }
      const following = followedVehicle.get() === tripKey
      openPanel({ kind: 'trip', id: moved.key })
      if (following) followedVehicle.start(moved.key)
    } else if (journey !== undefined) opened.current = { tripKey, journey }
  }, [tripKey, snapshot])
}

/** What the panel shows before it has an answer: on its way, not found, or failed. */
function Pending({ status, words }: { status: PanelStateOf<'trip'>['status']; words: Words }) {
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

interface DetailProps {
  answer: TripDetail
  /** The trip as the snapshot carries it, while it is on the map. */
  trip: SnapshotTrip | undefined
  network: Network | undefined
  /**
   * Whether the page's source has no positions, as the timetable source has none: the trip is
   * placed from the timetable by design, not as a fallback.
   */
  noPositions: boolean
  lang: Lang
  words: Words
}

/**
 * The trip's state, facts, place and stops, aged by the server's clock, then its messages and the
 * source line.
 */
function Detail({ answer, trip, network, noPositions, lang, words }: DetailProps) {
  const now = useServerSecond(useClockOffset())
  // The trip's state now, by the clock, while the snapshot carries it; else the answer's.
  const state: DataState = useDataState(answer.key) ?? answer.state
  const timezone = timezoneOf(network)
  const cancelled = answer.cancelled === true
  const interval = runsToInterval(answer)
  // The snapshot's trip, where its place is along the answer's calls: not while the trip's detail
  // shows them another planned trip's, until the run files the vehicle under it.
  const along = answer.planned === undefined ? trip : undefined
  const next = nextCallOf(answer, along, now)
  const sentence = stateSentence({
    detail: answer,
    trip,
    state,
    timezone,
    words,
    noPositions,
    next,
  })
  const live = state === 'live' || state === 'ageing'
  const delaySeconds = shownDelayOf(answer, trip, next)
  // The messages listed now, from the trip's detail, and the moment it was called.
  const called = answer.source.kind === 'rejseplanen' ? answer.source.at : undefined
  const messages =
    called === undefined
      ? []
      : (answer.messages ?? []).filter((message) => disruptionPhase(message, now) !== undefined)
  const where =
    along && network && !cancelled && network.patterns.patterns[along.pattern]
      ? whereWords(
          whereOf({
            trip: along,
            state,
            fetched: answer.fetched,
            path: network.pathOf(along.pattern),
            calls: timedCallsOf(answer),
            now,
          }),
          answer,
          timezone,
          words,
        )
      : undefined
  const delay =
    cancelled || delaySeconds === undefined || !(live || state === 'estimated') ? undefined : (
      <Delay minutes={delaySeconds / 60} />
    )
  return (
    <>
      <div className={styles.state}>
        {cancelled ? null : (
          <VehicleDotLabel variant={state} line={badgeLine(answer.colour, answer.mode)} />
        )}
        {sentence === undefined ? null : <Text variant="body-sm">{sentence}</Text>}
      </div>
      <FactList
        aria-label={words.facts}
        items={[
          { label: words.delay, value: interval && !cancelled ? words.interval : delay },
          {
            label: words.lastSeen,
            value:
              live && trip?.reported !== undefined
                ? clockTime(trip.reported, timezone, { seconds: true })
                : undefined,
          },
          {
            label: words.nextStop,
            value: next === undefined ? undefined : answer.calls[next]?.name,
          },
        ]}
      />
      {where === undefined ? null : <Text variant="body-sm">{where}</Text>}
      {interval && answer.interval ? (
        <Text variant="body-sm" emphasis="secondary">
          {intervalWords(answer.interval, words)}
        </Text>
      ) : null}
      {state === 'no-signal' && !cancelled ? (
        <Text variant="caption" emphasis="secondary">
          {words.delayUnknown}
        </Text>
      ) : null}
      <StopTimeline
        aria-label={words.stops}
        line={badgeLine(answer.colour, answer.mode)}
        stops={timelineStops(answer, state, timezone, { messages, words })}
        {...(next === undefined ? {} : { nextStopIndex: next })}
      />
      {called === undefined ? null : (
        <Messages
          messages={messages}
          now={now}
          lang={lang}
          timezone={timezone}
          words={words}
          source={fill(words.messagesChecked, { time: clockTime(called, timezone) })}
        />
      )}
      {answer.source.kind === 'timetable' && !noPositions ? (
        <Text variant="caption" emphasis="secondary">
          {words.fromTimetable}
        </Text>
      ) : null}
      <SourceLine sources={sourcesOf(answer, trip, noPositions, timezone, words)} />
    </>
  )
}

/**
 * Where the panel's figures came from, each with its own time: the position, from the answer that
 * last carried the trip, when Rejseplanen has carried it; then the times, from a `journeyDetail`
 * call or from the timetable shifted by the snapshot's delay. "Rejseplanen · position 08:14:05 ·
 * times 08:14:20", the times reading as Rejseplanen's after the position; the timetable's alone
 * keeps its own name and the snapshot's time. On a source with no positions, such as the
 * timetable, the place and the times are both the timetable's: "Timetable · placed 08:14:05"; or,
 * for a trip SIRI-ET has sent an update for, the timetable's moved by it, with the time of its
 * latest: "Timetable and Rejseplanen's delays · updated 08:14:05".
 */
function sourcesOf(
  answer: TripDetail,
  trip: SnapshotTrip | undefined,
  noPositions: boolean,
  timezone: string,
  words: Words,
): readonly [SourceLineSource] | readonly [SourceLineSource, SourceLineSource] {
  const at = (moment: number) => clockTime(moment, timezone, { seconds: true })
  if (noPositions) {
    const delays = answer.source.kind === 'timetable' ? answer.source.delays : undefined
    return delays === undefined
      ? [{ name: words.timetableSource, label: words.placedAt, time: at(answer.fetched) }]
      : [{ name: words.delaysSource, time: at(delays) }]
  }
  const called = answer.source.kind === 'rejseplanen' ? answer.source.at : undefined
  if (trip?.seen === undefined) {
    return called === undefined
      ? [{ name: words.timetableSource, time: at(answer.fetched) }]
      : [{ name: 'Rejseplanen', label: words.timesAt, time: at(called) }]
  }
  return [
    { name: 'Rejseplanen', label: words.positionAt, time: at(trip.seen) },
    called === undefined
      ? { label: words.timesFromTimetable }
      : { label: words.timesAt, time: at(called) },
  ]
}
