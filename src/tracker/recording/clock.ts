// A recording's clock (docs/testing-seams.md, "Time"): under a recording in a production build,
// the tracker's time starts at the moment in the recording's `clock.json` and runs on in real
// time, so the recorded day is "today" for the timetable and the snapshot's ages are recorded.
// Every runtime in one process that starts at the same moment reads the same time, whichever was
// built first; the aircraft's starts at its own moment when its answers were recorded on another
// day than the recording's (`aircraft/clock.json`), and runs on from that.
import 'server-only'
import { Clock, Effect, Layer } from 'effect'

/** The clock beneath moved by an offset, which `offsetFrom` takes from it when the layer is built. */
const moved = (offsetFrom: (base: Clock.Clock) => number): Layer.Layer<never> =>
  Layer.effect(
    Clock.Clock,
    Effect.gen(function* () {
      const base = yield* Clock.Clock
      const offset = offsetFrom(base)
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

/** The runtime's clock, moved back or forward so that it reads `start` when the layer is built. */
export const startingAt = (start: number): Layer.Layer<never> =>
  moved((base) => start - base.currentTimeMillisUnsafe())

/** Each recording start's offset from the process's clock, taken the first time it is asked. */
const offsets = new Map<number, number>()

/**
 * The runtime's clock, reading `start` when the first runtime in this process to start there was
 * built, and running on from it in every runtime built after.
 */
export const sharedStartingAt = (start: number): Layer.Layer<never> =>
  moved((base) => {
    let offset = offsets.get(start)
    if (offset === undefined) offsets.set(start, (offset = start - base.currentTimeMillisUnsafe()))
    return offset
  })
