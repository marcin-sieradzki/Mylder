import { daysBetween } from './dates.ts'
import type { DayProfilesFile, IsoDate } from './format.ts'
import { array, number, object, string } from './parse.ts'

export interface DayProfiles extends DayProfilesFile {
  /** A day's counts of planned trips underway by quarter hour, or undefined outside the window. */
  day(date: IsoDate): readonly number[] | undefined
}

/** Parses the day profiles file. */
export function readDayProfiles(json: unknown): DayProfiles {
  const file = object(json, 'day profiles file')
  const first = string(file.first, 'day profiles file.first')
  const days = array(file.days, 'days').map((day, i) =>
    array(day, `days[${i}]`).map((count) => number(count, `days[${i}]`)),
  )
  return {
    first,
    days,
    day: (date) => {
      const index = daysBetween(first, date)
      return index >= 0 ? days[index] : undefined
    },
  }
}
