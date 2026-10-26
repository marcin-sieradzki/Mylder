'use client'

import { Alert, type AlertProps } from '@mylder/perron'
import type { ClientDictionary } from '../i18n/dictionary'
import type { Lang } from '../i18n/lang'
import { useI18n } from '../i18n/useI18n'
import { useAircraftProvider } from '../map/aircraft'
import { useSnapshot } from '../map/live'
import { usePageNotices, type PageNotice } from '../map/notices'
import { timezoneOf, useNetwork } from '../map/timetable'
import { clockTime } from '../timetable/time'
import type { AircraftProvider } from '../tracker/aircraft/index'
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
 * What the source banner says of the aircraft, which have a source of their own: live from their
 * provider, or recorded; nothing while the page has none.
 */
function aircraftWords(
  provider: AircraftProvider | undefined,
  words: ClientDictionary['notices'],
): string | undefined {
  if (!provider) return undefined
  return provider === 'recording'
    ? words.aircraftRecorded
    : words.aircraftLive.replace('{provider}', provider)
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
 * the source banner. The banner names the transit's source, then says whether the planes are
 * live or recorded; recorded planes beside real transit get a banner of their own.
 */
export function PageNotices() {
  const i18n = useI18n()
  const list = usePageNotices()
  const provider = useAircraftProvider()
  // Every time reads on the timetable's clock, as the top bar's does.
  const timezone = timezoneOf(useNetwork(useSnapshot()?.timetableVersion))
  const planes = aircraftWords(provider, i18n.dictionary.notices)
  const transitBanner = list.some((notice) => notice.kind === 'source')
  const planesBanner = !transitBanner && provider === 'recording'
  if (list.length === 0 && !planesBanner) return null
  return (
    <div className={styles.notices}>
      {list.map((notice) => (
        <Alert key={notice.kind} color={COLOURS[notice.kind]} className={styles.notice}>
          {wordsOf(notice, i18n, timezone)}
          {notice.kind === 'source' && planes ? ` ${planes}` : null}
        </Alert>
      ))}
      {planesBanner ? (
        <Alert key="aircraft" color={COLOURS.source} className={styles.notice}>
          {planes}
        </Alert>
      ) : null}
    </div>
  )
}
