// What a dot's card says of it (docs/screens.md, "The hover card"; docs/data-states.md, "The
// states"): its line and destination, and its data state's label, aged by the server's clock.
// A report's age counts from the answer that carried it, No signal from the last position answer
// that carried the trip, and a Waiting trip gives its departure, never that the vehicle is there.
import type { DataState } from '../domain/data-state.ts'
import type { ClientDictionary } from '../i18n/dictionary.ts'
import { clockTime } from '../timetable/time.ts'
import type { SnapshotTrip } from '../tracker/index.ts'

type Words = ClientDictionary['vehicle']

/** Fills each `{name}` in `template` with its value. */
export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => String(values[name] ?? whole))

/** How long ago `moment` was at `now`: whole seconds under a minute, else whole minutes. */
function ageOf(moment: number, now: number, words: Words): string {
  const seconds = Math.max(0, Math.floor((now - moment) / 1000))
  return seconds < 60
    ? fill(words.seconds, { seconds })
    : fill(words.minutes, { minutes: Math.floor(seconds / 60) })
}

/** The card's heading, such as "Bus 5C to Husum Torv", in the top bar's words for the modes. */
export const titleOf = (trip: SnapshotTrip, dictionary: ClientDictionary): string =>
  fill(dictionary.vehicle.title, {
    mode: dictionary.modes[trip.mode],
    line: trip.line,
    headsign: trip.headsign,
  })

/**
 * The state's label for `trip` in `state` at `now`, such as "Reported 20 s ago", or none where
 * it would only repeat the state's word, as Timetable only's does. Its times read on the clock of
 * `timezone`, the timetable's.
 */
export function stateLabelOf(
  trip: SnapshotTrip,
  state: DataState,
  now: number,
  timezone: string,
  words: Words,
): string | undefined {
  const departs = trip.waiting ? trip.next[0]?.time : undefined
  if (departs !== undefined) return fill(words.departs, { time: clockTime(departs, timezone) })
  switch (state) {
    case 'live':
      return trip.reported === undefined
        ? undefined
        : fill(words.reported, { age: ageOf(trip.reported, now, words) })
    case 'ageing':
      return trip.reported === undefined
        ? undefined
        : fill(words.lastSeen, { age: ageOf(trip.reported, now, words) })
    case 'estimated':
      return words.estimated
    case 'no-signal': {
      const since = trip.seen ?? trip.reported ?? trip.updated
      return since === undefined
        ? undefined
        : fill(words.noSignalSince, { time: clockTime(since, timezone) })
    }
    case 'timetable-only':
      return undefined
  }
}
