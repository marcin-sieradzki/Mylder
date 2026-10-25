// An interval line's interval, as docs/data-states.md ("The Metro") and ADR 0006 give it: shown
// wherever a Metro departure time would be, since the Metro doesn't keep its planned times.

/** How often an interval line leaves a stop, in whole minutes; equal ends when the gaps are even. */
export interface Interval {
  readonly from: number
  readonly to: number
}

/**
 * An interval line's interval from its planned departures at one stop in one direction, between
 * two moments (usually the current hour). The typical gap is the middle half of the gaps between
 * departures, so one short or long gap doesn't widen it; a range shows when its ends round to
 * different minutes, such as "every 3 to 4 min".
 */
export function intervalOf(
  departures: readonly number[],
  start: number,
  end: number,
): Interval | undefined {
  const times = departures.filter((time) => time >= start && time < end).sort((a, b) => a - b)
  if (times.length < 2) return undefined
  const gaps = times
    .slice(1)
    .map((time, i) => time - times[i])
    .sort((a, b) => a - b)
  const quantile = (q: number) => gaps[Math.floor(q * (gaps.length - 1))]
  const minutes = (gap: number) => Math.max(1, Math.round(gap / 60_000))
  return { from: minutes(quantile(0.25)), to: minutes(quantile(0.75)) }
}
