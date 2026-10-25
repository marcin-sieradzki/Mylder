'use client'

import { PerronProvider } from '@mylder/perron'
import type { ReactNode } from 'react'
import { I18nProvider } from '../i18n/I18nProvider'
import type { ClientDictionary } from '../i18n/dictionary'
import type { Lang } from '../i18n/lang'

interface ProvidersProps {
  lang: Lang
  dictionary: ClientDictionary
  children: ReactNode
}

/** The client providers the server shell wraps the app in once. */
export function Providers({ lang, dictionary, children }: ProvidersProps) {
  return (
    <PerronProvider locale={lang}>
      <I18nProvider lang={lang} dictionary={dictionary}>
        {children}
      </I18nProvider>
    </PerronProvider>
  )
}
