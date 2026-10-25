import { NextResponse, type NextRequest } from 'next/server'
import { langFromAcceptLanguage } from './src/i18n/lang'

/** Sends a first visit to `/` on to the language its browser asks for, English by default. */
export function proxy(request: NextRequest) {
  const lang = langFromAcceptLanguage(request.headers.get('accept-language'))
  const url = request.nextUrl.clone()
  url.pathname = `/${lang}`
  const response = NextResponse.redirect(url)
  response.headers.set('Vary', 'Accept-Language')
  return response
}

export const config = { matcher: '/' }
