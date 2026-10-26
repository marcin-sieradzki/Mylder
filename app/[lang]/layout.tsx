import '@mylder/perron/perron.css'
import './globals.css'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { isLang, langs } from '../../src/i18n/lang'
import { getDictionary } from '../../src/i18n/server'
import { Providers } from '../../src/screens/Providers'

interface LangProps {
  params: Promise<{ lang: string }>
}

/** The path the pages sit under: the repository's in the GitHub Pages demo (ADR 0013), else none. */
const BASE_PATH = process.env.NEXT_PUBLIC_MYLDER_BASE_PATH ?? ''

// Only /en and /da exist; any other first segment is a 404.
export const dynamicParams = false

export function generateStaticParams() {
  return langs.map((lang) => ({ lang }))
}

export async function generateMetadata({ params }: LangProps): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const { meta } = await getDictionary(lang)
  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      languages: {
        ...Object.fromEntries(langs.map((each) => [each, `${BASE_PATH}/${each}`])),
        'x-default': `${BASE_PATH}/`,
      },
    },
  }
}

export default async function LangLayout({
  params,
  children,
}: LangProps & { children: ReactNode }) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  // the metadata words stay on the server; the client tree gets the rest
  const { meta: _meta, ...dictionary } = await getDictionary(lang)
  return (
    <html lang={lang}>
      <body>
        <Providers lang={lang} dictionary={dictionary}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
