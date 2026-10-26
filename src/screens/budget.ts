import type { ClientDictionary } from '../i18n/dictionary'
import type { Snapshot } from '../tracker/index'

/**
 * A poll's interval as the screens write it after "every": "90 s", or whole minutes from 2 min,
 * "2 min"; in Danish "90. sekund" and "2. minut". A minute stays "60 s", since "hvert 1. minut"
 * isn't Danish.
 */
export const intervalOf = (seconds: number, words: ClientDictionary['interval']): string =>
  seconds >= 120 && seconds % 60 === 0
    ? words.minutes.replace('{n}', String(seconds / 60))
    : words.seconds.replace('{n}', String(seconds))

/**
 * The budget line (docs/screens.md, "The moving map"), when the poll has stretched past a minute
 * to stay within the month's calls: "Updating every 90 s to stay within the data budget." None
 * while the poll is a minute, or once the budget is spent and positions are paused instead.
 */
export function budgetLine(snapshot: Snapshot, dictionary: ClientDictionary): string | undefined {
  if (snapshot.budget.level === 'spent' || snapshot.pollInterval <= 60) return undefined
  return dictionary.notices.budget.replace(
    '{interval}',
    intervalOf(snapshot.pollInterval, dictionary.interval),
  )
}
