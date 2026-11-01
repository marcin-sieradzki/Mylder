// The words a source's description names by their dictionary keys (src/domain/source.ts), in the
// page's language.
import type { SourceWords } from '../domain/source'
import type { ClientDictionary } from '../i18n/dictionary'

/** The dictionary's words at `key`, with their placeholders still in. */
export function sourceWords(dictionary: ClientDictionary, key: SourceWords): string {
  const { about, notices, onTimetable } = dictionary
  const words: Record<SourceWords, string> = {
    'notices.simulated': notices.simulated,
    'notices.recorded': notices.recorded,
    'onTimetable.legend': onTimetable.legend,
    'onTimetable.legendWithDelays': onTimetable.legendWithDelays,
    'about.status.rejseplanen': about.status.rejseplanen,
    'about.status.simulated': about.status.simulated,
    'about.status.recording': about.status.recording,
    'onTimetable.source': onTimetable.source,
    'about.status.notReal': about.status.notReal,
    'onTimetable.note': onTimetable.note,
  }
  return words[key]
}
