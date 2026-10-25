import type { Locale } from '@mylder/perron'

/** A language of Mylder's interface: the first segment of every page's path. */
export type Lang = Extract<Locale, 'en' | 'da'>

export const langs = ['en', 'da'] as const satisfies readonly Lang[]

/** The language for a request that names none it can serve. */
export const defaultLang: Lang = 'en'

export function isLang(value: string): value is Lang {
  return (langs as readonly string[]).includes(value)
}

/**
 * The first of Mylder's languages an `Accept-Language` header asks for, by its weights, or English
 * when it asks for neither.
 */
export function langFromAcceptLanguage(header: string | null): Lang {
  const asked = (header ?? '')
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.split(';').map((piece) => piece.trim().toLowerCase())
      const q = params.find((param) => param.startsWith('q='))
      return { lang: tag.split('-')[0], weight: q ? Number(q.slice(2)) : 1 }
    })
    .filter(({ weight }) => weight > 0)
    .sort((a, b) => b.weight - a.weight)
  return (asked.find(({ lang }) => isLang(lang))?.lang as Lang | undefined) ?? defaultLang
}

/** The same address in another language: the first path segment changes, the rest stays. */
export function pathInLang(pathname: string, search: string, lang: Lang): string {
  const rest = pathname.replace(/^\/[^/]*/, '')
  return `/${lang}${rest}${search}`
}
