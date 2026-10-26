// A recording's clock (docs/testing-seams.md, "Time"): under a recording in a production build,
// the tracker's time starts at the moment in the recording's `clock.json` and runs on in real
// time, so the recorded day is "today" for the timetable and the snapshot's ages are recorded.
import 'server-only'
import { Clock, Effect, Layer } from 'effect'

/** The runtime's clock, moved back or forward so that it reads `start` when the layer is built. */
export const startingAt = (start: number): Layer.Layer<never> =>
  Layer.effect(
    Clock.Clock,
    Effect.gen(function* () {
      const base = yield* Clock.Clock
      const offset = start - base.currentTimeMillisUnsafe()
      const nanos = BigInt(offset) * 1_000_000n
      const clock: Clock.Clock = {
        currentTimeMillisUnsafe: () => base.currentTimeMillisUnsafe() + offset,
        currentTimeMillis: Effect.map(base.currentTimeMillis, (now) => now + offset),
        currentTimeNanosUnsafe: () => base.currentTimeNanosUnsafe() + nanos,
        currentTimeNanos: Effect.map(base.currentTimeNanos, (now) => now + nanos),
        monotonicTimeNanosUnsafe: () => base.monotonicTimeNanosUnsafe(),
        monotonicTimeNanos: base.monotonicTimeNanos,
        sleep: (duration) => base.sleep(duration),
      }
      return clock
    }),
  ) as Layer.Layer<never>
