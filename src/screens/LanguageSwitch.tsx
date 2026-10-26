'use client'

import { LinkButton } from '@mylder/perron'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useI18n } from '../i18n/useI18n'
import { langs, pathInLang } from '../i18n/lang'
import { readableQuery } from '../map/view'

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

// The query carries the map's view and filters (src/map/view.ts), so the other language opens
// the map as it is now.
function SwitchLinkWithQuery({ pathname }: { pathname: string }) {
  const params = useSearchParams()
  const query = params ? readableQuery(params) : ''
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
