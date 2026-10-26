'use client'

import { Alert, type AlertProps } from '@mylder/perron'
import type { ClientDictionary } from '../i18n/dictionary'
import type { Lang } from '../i18n/lang'
import { useI18n } from '../i18n/useI18n'
import { usePageNotices, type PageNotice } from '../map/notices'
import styles from './PageNotices.module.css'

const LOCALES: Record<Lang, string> = { en: 'en-GB', da: 'da-DK' }

const dates = new Map<string, Intl.DateTimeFormat>()

/** A moment's date as the zone reads it, in the page's language: `16 June 2026`, `16. juni 2026`. */
function longDate(moment: number, lang: Lang, timezone: string): string {
  const key = `${lang} ${timezone}`
  let format = dates.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALES[lang], {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    dates.set(key, format)
  }
  return format.format(moment)
}

const daysAndMonths = new Map<Lang, Intl.DateTimeFormat>()

/** A calendar date, `2026-11-01`, as the page's language says it: `1 November`, `1. november`. */
function dayAndMonth(date: string, lang: Lang): string {
  let format = daysAndMonths.get(lang)
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALES[lang], {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
    })
    daysAndMonths.set(lang, format)
  }
  return format.format(Date.parse(`${date}T00:00:00Z`))
}

const clocks = new Map<string, Intl.DateTimeFormat>()

/** A moment as the zone's 24-hour clock reads it: `08:16`, or with seconds `08:14:05`. */
function clockTime(moment: number, timezone: string, seconds = false): string {
  const key = `${timezone} ${seconds}`
  let clock = clocks.get(key)
  if (!clock) {
    clock = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      ...(seconds ? { second: '2-digit' } : {}),
    })
    clocks.set(key, clock)
  }
  return clock.format(moment)
}

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
            .replace('{data}', clockTime(notice.lastData, timezone, true))
    }
    case 'paused':
      if (notice.reason === 'no-answer') {
        return words.noAnswer.replace('{since}', clockTime(notice.since, timezone))
      }
      return notice.resumes === undefined
        ? words.spentNoDate
        : words.spent.replace('{date}', dayAndMonth(notice.resumes, lang))
    case 'budget': {
      const { pollInterval } = notice
      const interval =
        pollInterval % 60 === 0
          ? words.minutes.replace('{n}', String(pollInterval / 60))
          : words.seconds.replace('{n}', String(pollInterval))
      return words.budget.replace('{interval}', interval)
    }
    case 'timetable':
      return (notice.ended ? words.timetableEnded : words.timetableEnds).replace(
        '{date}',
        dayAndMonth(notice.last, lang),
      )
    case 'source':
      return notice.source === 'simulated'
        ? words.simulated
        : words.recorded.replace('{date}', longDate(notice.fetched, lang, timezone))
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
  const { timezone, list } = usePageNotices()
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
