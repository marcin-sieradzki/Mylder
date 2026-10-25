'use client'

import { createContext, use } from 'react'
import type { Dictionary } from './dictionary'
import type { Lang } from './lang'

export interface I18n {
  lang: Lang
  dictionary: Dictionary
}

export const I18nContext = createContext<I18n | null>(null)

/** The page's language and its dictionary, from the nearest I18nProvider. */
export function useI18n(): I18n {
  const i18n = use(I18nContext)
  if (!i18n) throw new Error('useI18n needs an I18nProvider above it')
  return i18n
}
