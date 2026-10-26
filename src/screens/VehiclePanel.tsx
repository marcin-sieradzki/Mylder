'use client'

import { Delay, EmptyState, FactList, Text, VehicleDotLabel } from '@mylder/perron'
import {
  DetailPanel,
  SourceLine,
  StopTimeline,
  type SourceLineSource,
} from '@mylder/perron/patterns'
import type { DataState } from '../domain/data-state'
import type { ClientDictionary } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import { useClockOffset, useSnapshot } from '../map/live'
import type { PanelStateOf } from '../map/panels'
import { useDataState } from '../map/states'
import { useHiddenModes } from '../map/view'
import { onMap } from '../map/vehicles'
import { timezoneOf, useNetwork } from '../map/timetable'
import { whereOf } from '../map/where'
import type { Network } from '../timetable/network'
import { clockTime } from '../timetable/time'
import type { SnapshotTrip, TripDetail } from '../tracker/index'
import type { PanelFrame } from './DetailPanels'
import { badgeLine } from './departureRow'
import { useServerSecond } from './useServerSecond'
import { VehicleActions } from './VehicleActions'
import {
  intervalWords,
  nextCallOf,
  runsToInterval,
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
 * means, its facts, where it is, its stops and where their times came from. Its header names the
 * trip from the snapshot while the answer is on its way. The header's action row holds Follow and
 * Show whole line.
 */
export function VehiclePanel({ state, frame }: VehiclePanelProps) {
  const { dictionary } = useI18n()
  const words = dictionary.trip
  const snapshot = useSnapshot()
  const network = useNetwork(snapshot?.timetableVersion)
  const { answer, status } = state
  const trip = snapshot?.trips.find((each) => each.key === state.panel.id)
  const hidden = useHiddenModes()
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
        <Detail answer={answer} trip={trip} network={network} words={words} />
      ) : (
        <Pending status={status} words={words} />
      )}
    </DetailPanel>
  )
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
  words: Words
}

/** The trip's state, facts, place and stops, aged by the server's clock, then the source line. */
function Detail({ answer, trip, network, words }: DetailProps) {
  const now = useServerSecond(useClockOffset())
  // The trip's state now, by the clock, while the snapshot carries it; else the answer's.
  const state: DataState = useDataState(answer.key) ?? answer.state
  const timezone = timezoneOf(network)
  const cancelled = answer.cancelled === true
  const interval = runsToInterval(answer, state)
  const sentence = stateSentence({ detail: answer, trip, state, timezone, words })
  const next = nextCallOf(answer, trip, now)
  const live = state === 'live' || state === 'ageing'
  const where =
    trip && network && !cancelled && network.patterns.patterns[trip.pattern]
      ? whereWords(
          whereOf({
            trip,
            state,
            fetched: answer.fetched,
            path: network.pathOf(trip.pattern),
            calls: timedCallsOf(answer),
            now,
          }),
          answer,
          timezone,
          words,
        )
      : undefined
  const delay =
    cancelled || answer.delay === undefined || !(live || state === 'estimated') ? undefined : (
      <Delay minutes={answer.delay / 60} />
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
        stops={timelineStops(answer, state, timezone)}
        {...(next === undefined ? {} : { nextStopIndex: next })}
      />
      {answer.source.kind === 'timetable' ? (
        <Text variant="caption" emphasis="secondary">
          {words.fromTimetable}
        </Text>
      ) : null}
      <SourceLine sources={sourcesOf(answer, trip, timezone, words)} />
    </>
  )
}

/**
 * Where the panel's figures came from, each with its own time: the position, from the answer that
 * last carried the trip, when Rejseplanen has carried it; then the times, from a `journeyDetail`
 * call or from the timetable shifted by the snapshot's delay.
 */
function sourcesOf(
  answer: TripDetail,
  trip: SnapshotTrip | undefined,
  timezone: string,
  words: Words,
): readonly [SourceLineSource] | readonly [SourceLineSource, SourceLineSource] {
  const at = (moment: number) => clockTime(moment, timezone, { seconds: true })
  const times: SourceLineSource =
    answer.source.kind === 'rejseplanen'
      ? { name: words.callSource, time: at(answer.source.at) }
      : { name: words.timetableSource, time: at(answer.fetched) }
  return trip?.seen === undefined
    ? [times]
    : [{ name: words.positionSource, time: at(trip.seen) }, times]
}
