// Where the tracker's updates come from, picked by `MYLDER_UPDATES` at request time
// (docs/testing-seams.md, "The update switch"), apart from `MYLDER_SOURCE`, so delays work on the
// timetable source now and on Rejseplanen's later (spec #146): off (the default), SIRI-ET's update
// table as the listener keeps it in the store, or the SIRI-ET reader run inside the tracker over a
// recording's messages.
import 'server-only'
import { join } from 'node:path'
import { Clock, Context, Effect, Layer } from 'effect'
import type { Call } from '../domain/trip-motion.ts'
import { siriEtReader } from '../siri-et/reader.ts'
import { readBox, siriEtReplay } from '../siri-et/recording.ts'
import { readUpdateTable } from '../siri-et/store.ts'
import type { DelayStep, UpdateTable } from '../siri-et/table.ts'
import type { PlannedTrip } from '../timetable/trips.ts'
import { callIndexOf, joinTableJourney } from './join.ts'
import { recordingDir } from './recording/layer.ts'
import { Store } from './store.ts'
import type { Timetable } from './timetable.ts'

/** Where updates come from: none, the listener's table in the store, or a recording's messages. */
export type Updates =
  | { readonly kind: 'off' }
  | { readonly kind: 'siri' }
  | { readonly kind: 'recording'; readonly folder: string }

/** The variable that picks where updates come from. */
export const UPDATES_VARIABLE = 'MYLDER_UPDATES'

const OFF: Updates = { kind: 'off' }

/**
 * Reads `MYLDER_UPDATES`: `off` (the default, when it is unset or empty, so local runs and tests
 * need no listener), `siri` or `recording:<folder>`. Anything else is a mistake worth stopping for.
 */
export function readUpdates(value: string | undefined): Updates {
  const setting = value?.trim() ?? ''
  if (setting === '' || setting === 'off') return OFF
  if (setting === 'siri') return { kind: 'siri' }
  const [kind, ...rest] = setting.split(':')
  const folder = rest.join(':')
  if (kind === 'recording' && folder) return { kind: 'recording', folder }
  throw new Error(`${UPDATES_VARIABLE}="${setting}" is none of off, siri or recording:<folder>`)
}

/** The variable's value as it was set, for a log line. */
export const updatesSetting = (updates: Updates): string =>
  updates.kind === 'recording' ? `recording:${updates.folder}` : updates.kind

/** What the tracker reads its updates from: the table at a moment, or none. */
export interface UpdateFeedShape {
  readonly updates: Updates
  /**
   * The update table at `now`: the listener's from the store, one get a run, or the reader's over
   * a recording's messages received by then; undefined when updates are off or the table is gone.
   */
  readonly table: (now: number) => Effect.Effect<UpdateTable | undefined>
}

export class UpdateFeed extends Context.Service<UpdateFeed, UpdateFeedShape>()(
  'mylder/tracker/UpdateFeed',
) {}

/**
 * The SIRI-ET reader inside the tracker, over a recording's messages: each table hands it the
 * messages received since the last, so the table follows the clock, as the listener's would.
 */
const fromRecording = (folder: string) =>
  Effect.gen(function* () {
    const dir = recordingDir(folder)
    const startedAt = yield* Clock.currentTimeMillis
    const [due, box] = yield* Effect.promise(() =>
      Promise.all([siriEtReplay(join(dir, 'messages.jsonl.gz')), readBox(join(dir, 'timetable'))]),
    )
    const reader = siriEtReader({ box, listener: { version: `recording:${folder}`, startedAt } })
    return (now: number) =>
      Effect.sync(() => {
        for (const message of due(now)) reader.receive(message)
        return reader.table(now)
      })
  })

/** The feed `updates` sets up; the listener's table is read from the tracker's store. */
export const feedLayer = (updates: Updates): Layer.Layer<UpdateFeed, never, Store> =>
  Layer.effect(
    UpdateFeed,
    Effect.gen(function* () {
      switch (updates.kind) {
        case 'off':
          return { updates, table: () => Effect.succeed(undefined) }
        case 'siri': {
          const store = yield* Store
          return { updates, table: () => readUpdateTable(store) }
        }
        case 'recording':
          return { updates, table: yield* fromRecording(updates.folder) }
      }
    }),
  )

/** What one journey of the table tells its trip (spec #146). */
export interface TripUpdate {
  /** When its journey's latest message was received. */
  readonly received: number
  readonly cancelled: boolean
  /** The trip's calls, with the expected times its delays give where each changes. */
  readonly calls: readonly Call[]
  /** The indexes of the calls it won't serve. */
  readonly cancelledCalls: readonly number[]
}

/** The table joined to the trips of the timetable. */
export interface JoinedTable {
  /** By trip key, each joined trip's update. */
  readonly trips: ReadonlyMap<string, TripUpdate>
  /** The journeys that joined no trip, by the mode of their dataset. */
  readonly unmatched: Readonly<Record<string, number>>
}

/** The mode each dataset carries: Movia's buses, DSB's trains, the S-tog and Lokaltog's trains. */
const DATASET_MODES: Readonly<Record<string, string>> = {
  '788': 'bus',
  '785': 'train',
  '801': 's-tog',
  '799': 'train',
}

export const NO_UPDATES: JoinedTable = { trips: new Map(), unmatched: {} }

/**
 * Joins each journey of the table to its trip (`joinTableJourney`, ./join.ts) and gives the trip
 * its update. A journey with no delay, no cancellation and no cancelled call yet tells its trip
 * nothing, as a departure row without a prognosis is no update (src/domain/data-state.ts), so it
 * joins but gives none. An unmatched journey, such as an Extra trip's, is counted and not drawn, as
 * a position answer's is (docs/timetable.md, "The join").
 */
export function joinTable(timetable: Timetable, table: UpdateTable): JoinedTable {
  const trips = new Map<string, TripUpdate>()
  const taken = new Set<string>()
  const unmatched: Record<string, number> = {}
  for (const journey of table.journeys) {
    const held = [
      ...(journey.first ? [journey.first] : []),
      ...journey.steps,
      ...(journey.cancelledCalls ?? []),
    ]
    const trip = joinTableJourney(timetable, { ...journey, calls: held }, taken)
    if (!trip) {
      const mode = DATASET_MODES[journey.dataset] ?? `dataset ${journey.dataset}`
      unmatched[mode] = (unmatched[mode] ?? 0) + 1
      continue
    }
    taken.add(trip.key)
    const cancelled = journey.cancelled === true
    if (!cancelled && journey.steps.length === 0 && !journey.cancelledCalls) continue
    trips.set(trip.key, {
      received: journey.received,
      cancelled,
      calls: expectedCalls(timetable, trip, journey.steps),
      cancelledCalls: (journey.cancelledCalls ?? [])
        .map((call) => callIndexOf(timetable, trip, call))
        .filter((index) => index >= 0),
    })
  }
  return { trips, unmatched }
}

/**
 * A trip's calls with the expected times its delay steps give: each step's call leaves `delay`
 * seconds late (and arrives so, at its last stop), and the calls between steps take the delay of
 * the step before them as the trip moves (`timedCalls`, src/domain/trip-motion.ts).
 */
function expectedCalls(
  timetable: Timetable,
  trip: PlannedTrip,
  steps: readonly DelayStep[],
): Call[] {
  const calls: Call[] = trip.calls.map(({ arrival, departure }) => ({ arrival, departure }))
  const last = calls.length - 1
  let from = 0
  for (const step of steps) {
    const i = callIndexOf(timetable, trip, step, from)
    if (i < 0) continue
    from = i + 1
    const late = step.delay * 1000
    calls[i] = {
      ...calls[i],
      expectedDeparture: calls[i].departure + late,
      ...(i === last ? { expectedArrival: calls[i].arrival + late } : {}),
    }
  }
  return calls
}
