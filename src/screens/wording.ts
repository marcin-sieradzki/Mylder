// How the screens write dates in the page's language, so the page notices and the About dialog
// say them alike.
import { intlLocale, type Lang } from '../i18n/lang.ts'

const days = new Map<Lang, Intl.DateTimeFormat>()

/** A calendar date such as `2026-10-12` as the language writes it: "12 October", "12. oktober". */
export function dayOf(date: string, lang: Lang): string {
  let format = days.get(lang)
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(lang), {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    })
    days.set(lang, format)
  }
  return format.format(Date.parse(`${date}T00:00:00Z`))
}

const longDates = new Map<string, Intl.DateTimeFormat>()

/** A moment's date as the zone reads it, in the language: "16 June 2026", "16. juni 2026". */
export function longDateOf(moment: number, lang: Lang, timezone: string): string {
  const key = `${lang} ${timezone}`
  let format = longDates.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(lang), {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    longDates.set(key, format)
  }
  return format.format(moment)
}
