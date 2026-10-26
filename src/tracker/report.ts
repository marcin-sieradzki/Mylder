// What each tracker run reports (docs/live-data.md, "Watching it"): one structured log line, and
// the same figures in the snapshot's status section, since the host keeps its logs only about an
// hour. Plain functions, and the CPU clock the run measures itself by; the run in `tracker.ts`
// measures and logs.
import 'server-only'
import { Context, Effect, Layer } from 'effect'
import { daysBetween } from '../timetable/dates.ts'
import type { IsoDate, Manifest } from '../timetable/format.ts'
import type { Snapshot, SnapshotTrip } from './snapshot.ts'

/** Under this many days of service left, the snapshot marks the timetable as running out. */
export const RUNNING_OUT_DAYS = 7

/** A timetable prepared longer ago than this is stale: its job may have stopped. */
export const STALE_DAYS = 30

/** The CPU time the process has used, in milliseconds, so a run can measure its own. */
export class CpuClock extends Context.Service<CpuClock, Effect.Effect<number>>()(
  'mylder/tracker/CpuClock',
) {}

/** The process's own CPU time. */
export const processCpu: Layer.Layer<CpuClock> = Layer.succeed(
  CpuClock,
  Effect.sync(() => {
    const { user, system } = process.cpuUsage()
    return (user + system) / 1000
  }),
)

/** A clock that never moves, for runs whose snapshots must come out the same every time. */
export const stoppedCpu: Layer.Layer<CpuClock> = Layer.succeed(CpuClock, Effect.succeed(0))

/** How long the timetable has left and how old it is, on a service day. */
export function timetableAge(
  manifest: Manifest,
  serviceDay: IsoDate,
): Snapshot['status']['timetable'] {
  return {
    prepared: manifest.preparedDate,
    last: manifest.window.last,
    // Today counts: on its last covered day, a timetable has one day left.
    daysLeft: Math.max(daysBetween(serviceDay, manifest.window.last) + 1, 0),
    daysOld: daysBetween(manifest.preparedDate, serviceDay),
  }
}

/** Trips by a field's value, as the status section counts them. */
export function countBy(
  trips: readonly SnapshotTrip[],
  field: 'mode' | 'state',
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const trip of trips) counts[trip[field]] = (counts[trip[field]] ?? 0) + 1
  return counts
}

/** The run's log line: the snapshot's status with the source, the mode, the budget and the store. */
export const runLine = ({ source, positionMode, answerMode, budget, store, status }: Snapshot) => ({
  source,
  positionMode,
  ...(answerMode ? { answerMode } : {}),
  budget: { level: budget.level, calls: budget.calls },
  store,
  ...status,
})
