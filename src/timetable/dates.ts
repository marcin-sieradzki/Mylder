import type { IsoDate } from './format.ts'

// Calendar dates as `YYYY-MM-DD`, counted in whole days through UTC so no clock or time zone
// ever shifts them.

const DAY = 86_400_000

/** Midnight UTC on a date, in milliseconds. */
export function utc(date: IsoDate): number {
  return Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(utc(date) + days * DAY).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`; negative when `to` comes first. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((utc(to) - utc(from)) / DAY)
}

/** 0 for Monday to 6 for Sunday, as GTFS orders the week. */
export function weekday(date: IsoDate): number {
  return (new Date(utc(date)).getUTCDay() + 6) % 7
}

/** The first Tuesday on or after a day. */
export function tuesdayFrom(date: IsoDate): IsoDate {
  return addDays(date, (1 - weekday(date) + 7) % 7)
}
