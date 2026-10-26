import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { dataCards } from '../domain/data-cards'
import { trackerLayer } from './runtime'
import { readSource } from './source'
import { fixtureTimetable } from './testing'
import { Tracker } from './tracker'

// Mylder's own data cards over the patchy scenario, whose Rejseplanen is unavailable from minute
// 20 to 27 of every hour: the card that says it hasn't answered shows during the outage and
// clears once it answers again. 07:10 in Copenhagen on Tuesday 2026-06-16.
const START = Date.UTC(2026, 5, 16, 5, 10)
const MINUTE = 60_000

const timetable = await fixtureTimetable()

describe("Mylder's own data cards on the patchy scenario", () => {
  it.effect('say Rejseplanen has not answered during the outage, and clear after it', () =>
    Effect.gen(function* () {
      const tracker = yield* Tracker
      /** The minutes past the hour whose cards say Rejseplanen hasn't answered. */
      const unanswered: number[] = []
      for (let minute = 10; minute <= 35; minute++) {
        const now = START + (minute - 10) * MINUTE
        yield* TestClock.setTime(now)
        const snapshot = yield* tracker.getSnapshot
        if (dataCards(snapshot, now).some((card) => card.kind === 'no-answer')) {
          unanswered.push(minute)
        }
      }
      // The outage runs from 20 to 27 past; its card waits 5 min from the last answer, at 19 past,
      // and clears with the first answer after it.
      expect(unanswered).toEqual([24, 25, 26])
    }).pipe(Effect.provide(trackerLayer({ timetable, source: readSource('simulated:patchy') }))),
  )
})
