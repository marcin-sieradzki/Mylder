// The call budget's pacing (docs/live-data.md, "The pacing rule"): each run compares the month's
// calls with the line, the share of 50,000 that the month's minutes so far allow, and sets the
// level, which decides the poll interval, how often the disruptions are fetched and whether
// on-demand calls are allowed. The level moves only at a run; the snapshot carries it.
import 'server-only'
import type { IsoDate } from '../timetable/format.ts'
import { wallClock } from '../timetable/time.ts'
import type { Snapshot } from './snapshot.ts'

/** The calls the free key allows in a calendar month. */
export const MONTHLY_CALLS = 50_000

/** The month is spent at this many calls; the rest covers a counter a few minutes behind. */
export const SPENT_AT = 49_500

/** On-demand calls stop when the month's calls come this close to the line. */
export const CUSHION = 100

/** The month is tight when its calls run this far ahead of the line. */
export const TIGHT_GAP = 1_500

export type BudgetLevel = Snapshot['budget']['level']

/** Seconds between runs at each level. A spent month makes no call, but its trips still age. */
const POLL_INTERVAL: Readonly<Record<BudgetLevel, number>> = {
  normal: 60,
  stretched: 90,
  tight: 120,
  spent: 60,
}

/** Minutes between disruption fetches at each level; none when spent. */
const DISRUPTIONS_EVERY: Readonly<Record<BudgetLevel, number | undefined>> = {
  normal: 15,
  stretched: 15,
  tight: 30,
  spent: undefined,
}

/** A calendar month in a zone: its key, `2026-10`, its bounds, and the date the next begins. */
export interface Month {
  readonly key: string
  readonly start: number
  readonly end: number
  readonly next: IsoDate
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** The calendar month a moment falls in, in a zone. */
export function monthOf(now: number, timezone: string): Month {
  let format = formatters.get(timezone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
    })
    formatters.set(timezone, format)
  }
  const key = format.format(now).slice(0, 7)
  const [year, month] = key.split('-').map(Number)
  const next = `${month === 12 ? year + 1 : year}-${String((month % 12) + 1).padStart(2, '0')}-01`
  return {
    key,
    start: wallClock(`${key}-01` as IsoDate, 0, timezone),
    end: wallClock(next as IsoDate, 0, timezone),
    next: next as IsoDate,
  }
}

export interface PacingInput {
  /** The month's calls so far, every service's and every attempt's. */
  readonly calls: number
  readonly now: number
  readonly timezone: string
  /** Whether Rejseplanen has said this month that the quota is gone or the key is refused. */
  readonly quotaGone?: boolean
}

export interface Pacing {
  readonly month: Month
  readonly level: BudgetLevel
  readonly calls: number
  /** The calls the month allows by the end of this minute. */
  readonly line: number
  /** Calls spent minus the line: under zero is a cushion, over it the month runs ahead. */
  readonly gap: number
  /** Whether a viewer's opened stop or vehicle may spend a call; the calls are #32's. */
  readonly onDemand: boolean
  /** Seconds to the next run. */
  readonly pollInterval: number
  /** Minutes between disruption fetches, or undefined when there are none; the fetch is #57's. */
  readonly disruptionsEvery?: number
  /** When spent, the date live data resumes. */
  readonly resumes?: IsoDate
}

/**
 * The budget level for a run, from the month's calls before it calls. The line counts the minute
 * the run is in, so a month watched round the clock, one call a minute and one more every 15,
 * stays under it from the first minute.
 */
export function pacing({ calls, now, timezone, quotaGone = false }: PacingInput): Pacing {
  const month = monthOf(now, timezone)
  const minutes = (month.end - month.start) / 60_000
  const passed = Math.floor((now - month.start) / 60_000) + 1
  const line = (MONTHLY_CALLS * Math.min(passed, minutes)) / minutes
  const gap = calls - line
  const level: BudgetLevel =
    quotaGone || calls >= SPENT_AT
      ? 'spent'
      : gap > TIGHT_GAP
        ? 'tight'
        : gap > 0
          ? 'stretched'
          : 'normal'
  const disruptionsEvery = DISRUPTIONS_EVERY[level]
  return {
    month,
    level,
    calls,
    line,
    gap,
    onDemand: level === 'normal' && gap <= -CUSHION,
    pollInterval: POLL_INTERVAL[level],
    ...(disruptionsEvery === undefined ? {} : { disruptionsEvery }),
    ...(level === 'spent' ? { resumes: month.next } : {}),
  }
}
