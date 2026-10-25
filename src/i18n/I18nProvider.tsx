'use client'

import type { ReactNode } from 'react'
import { I18nContext, type I18n } from './useI18n'

/** Hands the language and the dictionary the server loaded to the client tree. */
export function I18nProvider({ lang, dictionary, children }: I18n & { children: ReactNode }) {
  return <I18nContext value={{ lang, dictionary }}>{children}</I18nContext>
}
