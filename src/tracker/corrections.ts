// The join's corrections in the store (docs/live-data.md, "What the store keeps"): by
// Rejseplanen's journey (`ZI@DA`), the trip an opened vehicle's `journeyDetail` showed it to be
// where the join's first guess was another. The store has no list or hash, and two viewers may
// correct two journeys at once, so no correction is read, changed and written back: each one is
// its own entry, numbered by its service day's counter, which `increment` hands out one at a
// time. A journey is corrected once, its first correction marked by `setIfAbsent`. Every join
// reads the corrections of the service days it joins: the counter, then each entry, a handful a
// day at most, as the join's first guess is seldom wrong.
import 'server-only'
import { Effect } from 'effect'
import type { IsoDate } from '../timetable/format.ts'
import type { Corrections } from './join.ts'
import type { StoreShape } from './store.ts'

/** How long a day's corrections are kept: past the last night trip of the day they correct. */
const CORRECTION_SECONDS = 2 * 86_400

/** One correction: the journey, and the trip it is. */
interface Correction {
  readonly journey: string
  readonly trip: string
}

export interface CorrectionStore {
  /** The corrections of these service days. */
  readonly read: (days: Iterable<IsoDate>) => Effect.Effect<Corrections>
  /** Keeps that `journey`, of the service day `day`, is the trip `tripKey`, unless it is already corrected. */
  readonly keep: (day: IsoDate, journey: string, tripKey: string) => Effect.Effect<void>
}

/** The corrections in `store`, under the tracker's keys. */
export function correctionsIn(store: StoreShape, key: (name: string) => string): CorrectionStore {
  const counter = (day: IsoDate) => key(`corrections:${day}`)
  const entry = (day: IsoDate, n: number) => key(`corrections:${day}:${n}`)
  return {
    read: (days) =>
      Effect.gen(function* () {
        const corrections: Record<string, string> = {}
        for (const day of days) {
          const stored = yield* store.get(counter(day))
          const count = typeof stored === 'number' ? stored : 0
          for (let n = 1; n <= count; n++) {
            // An entry whose number is handed out and not yet written is read next time.
            const correction = (yield* store.get(entry(day, n))) as Correction | undefined
            if (correction) corrections[correction.journey] = correction.trip
          }
        }
        return corrections
      }),
    keep: (day, journey, tripKey) =>
      Effect.gen(function* () {
        const marked = key(`correction:${journey}`)
        if (!(yield* store.setIfAbsent(marked, tripKey, CORRECTION_SECONDS))) return
        const n = yield* store.increment(counter(day), CORRECTION_SECONDS)
        const correction: Correction = { journey, trip: tripKey }
        yield* store.set(entry(day, n), correction, CORRECTION_SECONDS)
      }),
  }
}
