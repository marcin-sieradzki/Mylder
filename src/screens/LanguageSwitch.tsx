'use client'

import { LinkButton } from '@mylder/perron'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useI18n } from '../i18n/useI18n'
import { langs, pathInLang } from '../i18n/lang'

/**
 * A link to the same address in the other language. The query string is read on the client only,
 * so until it is, and in the prerendered page, the link keeps the path alone.
 */
export function LanguageSwitch() {
  const { lang, dictionary } = useI18n()
  const pathname = usePathname() ?? `/${lang}`
  return (
    <nav aria-label={dictionary.language.label}>
      <Suspense fallback={<SwitchLink pathname={pathname} search="" />}>
        <SwitchLinkWithQuery pathname={pathname} />
      </Suspense>
    </nav>
  )
}

function SwitchLinkWithQuery({ pathname }: { pathname: string }) {
  const query = useSearchParams()?.toString()
  return <SwitchLink pathname={pathname} search={query ? `?${query}` : ''} />
}

function SwitchLink({ pathname, search }: { pathname: string; search: string }) {
  const { lang, dictionary } = useI18n()
  const other = langs.find((each) => each !== lang)!
  return (
    <LinkButton
      href={pathInLang(pathname, search, other)}
      hrefLang={other}
      lang={other}
      variant="outline"
      size="small"
    >
      {dictionary.language.switchTo}
    </LinkButton>
  )
}
