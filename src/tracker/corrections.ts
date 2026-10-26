// The join's corrections in the store (docs/live-data.md, "What the store keeps"): by
// Rejseplanen's journey (`ZI@DA`), the trip an opened vehicle's `journeyDetail` showed it to be
// where the join's first guess was another. The store has no list or hash, and two viewers may
// correct two journeys at once, so no correction is read, changed and written back: each one is
// its own entry, numbered by its service day's counter, which `increment` hands out one at a
// time, and a journey corrected again takes its latest entry. Every join reads the corrections of
// the service days it joins: the counter, then the entries at once, a handful a day at most, as
// the join's first guess is seldom wrong. A correction the day already has is not kept again, and
// a day keeps at most `MAX_CORRECTIONS`, so a trip opened again and again adds nothing.
import 'server-only'
import { Effect } from 'effect'
import type { IsoDate } from '../timetable/format.ts'
import type { Corrections } from './join.ts'
import type { StoreShape } from './store.ts'

/** How long a day's corrections are kept: past the last night trip of the day they correct. */
const CORRECTION_SECONDS = 2 * 86_400

/** The most corrections a service day keeps, which bounds what every join reads. */
const MAX_CORRECTIONS = 100

/** One correction: the journey, and the trip it is. */
interface Correction {
  readonly journey: string
  readonly trip: string
}

export interface CorrectionStore {
  /** The corrections of these service days, each journey's latest. */
  readonly read: (days: Iterable<IsoDate>) => Effect.Effect<Corrections>
  /** Keeps that `journey`, of the service day `day`, is the trip `tripKey`. */
  readonly keep: (day: IsoDate, journey: string, tripKey: string) => Effect.Effect<void>
}

/** The corrections in `store`, under the tracker's keys. */
export function correctionsIn(store: StoreShape, key: (name: string) => string): CorrectionStore {
  const counter = (day: IsoDate) => key(`corrections:${day}`)
  const entry = (day: IsoDate, n: number) => key(`corrections:${day}:${n}`)
  /** A day's entries handed out, and its corrections, each journey's latest. */
  const readDay = (day: IsoDate) =>
    Effect.gen(function* () {
      const stored = yield* store.get(counter(day))
      const count = Math.min(typeof stored === 'number' ? stored : 0, MAX_CORRECTIONS)
      const numbers = Array.from({ length: count }, (_, i) => i + 1)
      // An entry whose number is handed out and not yet written is read next time.
      const entries = yield* Effect.forEach(numbers, (n) => store.get(entry(day, n)), {
        concurrency: 'unbounded',
      })
      const corrections: Record<string, string> = {}
      for (const correction of entries as (Correction | undefined)[]) {
        if (correction) corrections[correction.journey] = correction.trip
      }
      return { count, corrections }
    })
  return {
    read: (days) =>
      Effect.forEach(days, readDay, { concurrency: 'unbounded' }).pipe(
        Effect.map((read) => Object.assign({}, ...read.map((day) => day.corrections))),
      ),
    keep: (day, journey, tripKey) =>
      Effect.gen(function* () {
        const { count, corrections } = yield* readDay(day)
        if (corrections[journey] === tripKey || count >= MAX_CORRECTIONS) return
        const n = yield* store.increment(counter(day), CORRECTION_SECONDS)
        if (n > MAX_CORRECTIONS) return
        const correction: Correction = { journey, trip: tripKey }
        yield* store.set(entry(day, n), correction, CORRECTION_SECONDS)
      }),
  }
}
