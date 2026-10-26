// The aircraft route's answer, built here so `app/api/aircraft/route.ts` stays one line: the
// snapshot with the CDN header held until its next due, dated on the source's own clock, which a
// recording sets; 404 when the source is off. It needs none of the tracker's runtime.
import 'server-only'
import { Effect } from 'effect'
import { AIRCRAFT_CACHING } from '../caching.ts'
import { cdnAnswer } from '../cdn-answer.ts'
import { runAircraft, type RunAircraft } from './runtime.ts'

/** The aircraft answers, each run by `run`: this instance's runtime, or a test's. */
export function aircraftAnswers(run: RunAircraft) {
  return {
    snapshot: () =>
      cdnAnswer(
        'aircraft',
        () => run((aircraft) => Effect.all({ value: aircraft.getSnapshot, now: aircraft.now })),
        AIRCRAFT_CACHING,
      ),
  }
}

export const aircraftResponse = aircraftAnswers(runAircraft).snapshot
