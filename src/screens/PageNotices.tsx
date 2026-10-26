'use client'

import { Alert, type AlertProps } from '@mylder/perron'
import type { ClientDictionary } from '../i18n/dictionary'
import type { Lang } from '../i18n/lang'
import { useI18n } from '../i18n/useI18n'
import { useSnapshot } from '../map/live'
import { usePageNotices, type PageNotice } from '../map/notices'
import { timezoneOf, useNetwork } from '../map/timetable'
import { clockTime } from '../timetable/time'
import { intervalOf } from './budget'
import styles from './PageNotices.module.css'
import { dayOf, longDateOf } from './wording'

/** One notice's sentences. */
function wordsOf(
  notice: PageNotice,
  { dictionary, lang }: { dictionary: ClientDictionary; lang: Lang },
  timezone: string,
): string {
  const words = dictionary.notices
  switch (notice.kind) {
    case 'disconnected': {
      const since = clockTime(notice.since, timezone)
      return notice.lastData === undefined
        ? words.disconnectedNoData.replace('{since}', since)
        : words.disconnected
            .replace('{since}', since)
            .replace('{data}', clockTime(notice.lastData, timezone, { seconds: true }))
    }
    case 'paused':
      if (notice.reason === 'no-answer') {
        return words.noAnswer.replace('{since}', clockTime(notice.since, timezone))
      }
      return notice.resumes === undefined
        ? words.spentNoDate
        : words.spent.replace('{date}', dayOf(notice.resumes, lang))
    case 'budget':
      return words.budget.replace(
        '{interval}',
        intervalOf(notice.pollInterval, dictionary.interval),
      )
    case 'timetable':
      return (notice.ended ? words.timetableEnded : words.timetableEnds).replace(
        '{date}',
        dayOf(notice.last, lang),
      )
    case 'source':
      return notice.source === 'simulated'
        ? words.simulated
        : words.recorded.replace('{date}', longDateOf(notice.fetched, lang, timezone))
  }
}

/**
 * Each notice's intent: what the page can't do is a warning, how it is paced plain, and where
 * the data comes from worth knowing.
 */
const COLOURS: Record<PageNotice['kind'], AlertProps['color']> = {
  disconnected: 'warning',
  paused: 'warning',
  budget: 'neutral',
  timetable: 'warning',
  source: 'info',
}

/**
 * The page notices (docs/screens.md, "Page notices"), as alerts at the top of the map, above
 * every panel: Disconnected, then Paused beneath it, the budget line, the timetable notice and
 * the source banner.
 */
export function PageNotices() {
  const i18n = useI18n()
  const list = usePageNotices()
  // Every time reads on the timetable's clock, as the top bar's does.
  const timezone = timezoneOf(useNetwork(useSnapshot()?.timetableVersion))
  if (list.length === 0) return null
  return (
    <div className={styles.notices}>
      {list.map((notice) => (
        <Alert key={notice.kind} color={COLOURS[notice.kind]} className={styles.notice}>
          {wordsOf(notice, i18n, timezone)}
        </Alert>
      ))}
    </div>
  )
}
