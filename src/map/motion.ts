// Where each dot is drawn between polls, as docs/live-data.md gives it ("Opening mid-minute",
// "Moving between polls"): a trip's timeline from the snapshot, its progress at fetch and then
// each next call's at its time, which the dot follows at constant speed by the domain's motion
// rules; and, when a new snapshot lands, how the dot reaches the new timeline from where it is
// drawn. Times are on the server's clock, in milliseconds since the epoch; distances are metres
// along the pattern's path.
import 'client-only'
import {
  progressAt,
  timelineFrom,
  type MeasuredPath,
  type Timeline,
} from '../domain/trip-motion.ts'
import type { SnapshotTrip } from '../tracker/index.ts'

/** A new target this near the drawn dot, along the path, is eased to rather than jumped to. */
export const EASE_WITHIN = 500

/** How long a dot takes to ease to its new target. */
export const EASE_FOR = 1000

/** A new target this little behind the drawn dot is jitter: the dot holds until it catches up. */
export const JITTER_BEHIND = 150

/** How long a dot takes to fade out where it is drawn and in again at its new target. */
export const FADE_FOR = 500

/** Where a dot was drawn when its new timeline arrived. */
export interface Drawn {
  readonly progress: number
  readonly at: number
}

/** How a dot reaches its new timeline from where it was drawn. */
type Approach = 'ease' | 'hold' | 'fade'

/** A trip's way along its pattern's path from one snapshot, and how its dot joins it. */
export interface Motion {
  readonly timeline: Timeline
  readonly length: number
  readonly from?: Drawn & { readonly approach: Approach }
}

/** Where a dot is drawn at a moment: metres along its path, and how opaque, 0 to 1. */
export interface Placement {
  readonly progress: number
  readonly opacity: number
}

/** A trip's timeline from a snapshot fetched at `fetched`, along its pattern's `path`. */
function timelineOf(trip: SnapshotTrip, fetched: number, path: MeasuredPath): Timeline {
  const calls = trip.next.map((call) => ({ time: call.time, progress: path.stops[call.index] }))
  return timelineFrom(calls, { time: fetched, progress: trip.progress })
}

/**
 * A trip's motion from a snapshot fetched at `fetched`, along its pattern's `path`. A dot
 * already `drawn` reaches the new timeline from there: it eases to a target under 500 m away,
 * holds for one less than 150 m behind, and fades and jumps to one farther. A dot not yet drawn
 * starts where the timeline puts it.
 */
export function motionOf(
  trip: SnapshotTrip,
  fetched: number,
  path: MeasuredPath,
  drawn?: Drawn,
): Motion {
  const timeline = timelineOf(trip, fetched, path)
  return {
    timeline,
    length: path.length,
    ...(drawn ? { from: approach(timeline, path, drawn) } : {}),
  }
}

function approach(timeline: Timeline, path: MeasuredPath, drawn: Drawn): Motion['from'] {
  const step = progressAt(timeline, drawn.at, path.length) - drawn.progress
  const how: Approach =
    step < 0 && -step < JITTER_BEHIND ? 'hold' : Math.abs(step) < EASE_WITHIN ? 'ease' : 'fade'
  return { ...drawn, approach: how }
}

/** Slow out of the old place and into the new, 0 to 1. */
const smooth = (share: number) => share * share * (3 - 2 * share)

/** Where a trip's dot is drawn at `now`. */
export function placeAt(motion: Motion, now: number): Placement {
  const target = progressAt(motion.timeline, now, motion.length)
  const { from } = motion
  if (!from) return { progress: target, opacity: 1 }
  const since = now - from.at
  switch (from.approach) {
    case 'hold':
      return { progress: Math.max(from.progress, target), opacity: 1 }
    case 'ease': {
      if (since >= EASE_FOR) return { progress: target, opacity: 1 }
      const share = smooth(Math.max(since, 0) / EASE_FOR)
      return { progress: from.progress + (target - from.progress) * share, opacity: 1 }
    }
    case 'fade': {
      const half = FADE_FOR / 2
      if (since >= FADE_FOR) return { progress: target, opacity: 1 }
      if (since < half) return { progress: from.progress, opacity: 1 - Math.max(since, 0) / half }
      return { progress: target, opacity: (since - half) / half }
    }
  }
}
