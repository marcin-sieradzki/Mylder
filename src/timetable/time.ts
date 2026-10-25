import { addDays } from './dates.ts'
import type { IsoDate } from './format.ts'

// Wall-clock times in the timetable's zone, worked out with Intl so no library is needed.

const formatters = new Map<string, Intl.DateTimeFormat>()

/** How far the zone's clock runs ahead of UTC at a moment, in milliseconds. */
function offset(utc: number, timezone: string): number {
  let formatter = formatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timezone, formatter)
  }
  const part: Record<string, number> = {}
  for (const { type, value } of formatter.formatToParts(utc)) part[type] = Number(value)
  const wall = Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second)
  return wall - Math.floor(utc / 1000) * 1000
}

/** The moment the zone's clock reads `seconds` after midnight on `day`. */
export function wallClock(day: IsoDate, seconds: number, timezone: string): number {
  const extraDays = Math.floor(seconds / 86_400)
  const date = addDays(day, extraDays)
  const wall =
    Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) +
    (seconds - extraDays * 86_400) * 1000
  const guess = wall - offset(wall, timezone)
  return wall - offset(guess, timezone)
}

/**
 * The moment a service day's GTFS times count from: noon minus twelve hours, which is midnight
 * on every day but the two the clocks change.
 */
export function serviceDayStart(day: IsoDate, timezone: string): number {
  return wallClock(day, 12 * 3600, timezone) - 12 * 3600 * 1000
}
