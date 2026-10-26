import type { ClientDictionary } from '../i18n/dictionary'
import type { Snapshot } from '../tracker/index'

/** A poll's interval as the screens write it: "90 s", or whole minutes from 2 min, "2 min". */
export const intervalOf = (seconds: number, words: ClientDictionary['vehicle']): string =>
  seconds >= 120 && seconds % 60 === 0
    ? words.minutes.replace('{minutes}', String(seconds / 60))
    : words.seconds.replace('{seconds}', String(seconds))

/**
 * The budget line (docs/screens.md, "The moving map"), when the poll has stretched past a minute
 * to stay within the month's calls: "Updating every 90 s to stay within the data budget." None
 * while the poll is a minute, or once the budget is spent and positions are paused instead.
 */
export function budgetLine(snapshot: Snapshot, dictionary: ClientDictionary): string | undefined {
  if (snapshot.budget.level === 'spent' || snapshot.pollInterval <= 60) return undefined
  return dictionary.about.status.budgetLine.replace(
    '{interval}',
    intervalOf(snapshot.pollInterval, dictionary.vehicle),
  )
}
