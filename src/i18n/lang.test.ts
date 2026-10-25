import { describe, expect, it } from 'vitest'
import { langFromAcceptLanguage, pathInLang } from './lang'

describe('langFromAcceptLanguage', () => {
  it.each([
    ['da-DK,da;q=0.9,en;q=0.8', 'da'],
    ['da', 'da'],
    ['en-GB,en;q=0.9', 'en'],
    ['de-DE,de;q=0.9,da;q=0.5', 'da'],
    ['en;q=0.4,da;q=0.8', 'da'],
    ['da;q=0,en', 'en'],
    ['da;Q=0,en', 'en'],
    ['en;q=0.5, da ;q=0.9', 'da'],
    ['DA-dk', 'da'],
    ['sv-SE,nb;q=0.8', 'en'],
    ['*', 'en'],
    ['', 'en'],
    [null, 'en'],
  ])('reads %j as %s', (header, lang) => {
    expect(langFromAcceptLanguage(header)).toBe(lang)
  })
})

describe('pathInLang', () => {
  it.each([
    ['/en', '', 'da', '/da'],
    ['/en/stops/8600626', '', 'da', '/da/stops/8600626'],
    ['/da', '?line=5C&zoom=13', 'en', '/en?line=5C&zoom=13'],
    ['/da/vehicles', '?sort=delay', 'en', '/en/vehicles?sort=delay'],
  ] as const)('moves %s%s to %s as %s', (pathname, search, lang, href) => {
    expect(pathInLang(pathname, search, lang)).toBe(href)
  })
})
