import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { MapCredit } from './MapCredit'
import { Providers } from './Providers'

function show(lang: Lang) {
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapCredit />
    </Providers>,
  )
  return screen.getByText((_, element) => element?.classList.contains('pn-Attribution') ?? false)
}

/** Each credit's link: its words and where it goes. */
const links = () =>
  screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])

const SOURCES = [
  ['Rejseplanen', 'https://www.rejseplanen.dk/'],
  ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
  ['© OpenMapTiles', 'https://openmaptiles.org/'],
  ['OpenFreeMap', 'https://openfreemap.org/'],
]

describe("the map's corner credit", () => {
  it('credits the transit data and the map, each with its link, in English', () => {
    const credit = show('en')
    expect(credit).toHaveTextContent(
      'Transit data: Rejseplanen (CC BY 4.0) · © OpenStreetMap contributors · © OpenMapTiles · OpenFreeMap',
    )
    expect(links()).toEqual([
      ...SOURCES.slice(0, 2),
      ['© OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright'],
      ...SOURCES.slice(2),
    ])
  })

  it('credits them in Danish', () => {
    const credit = show('da')
    expect(credit).toHaveTextContent(
      'Trafikdata: Rejseplanen (CC BY 4.0) · © OpenStreetMap-bidragydere · © OpenMapTiles · OpenFreeMap',
    )
    expect(links()).toEqual([
      ...SOURCES.slice(0, 2),
      ['© OpenStreetMap-bidragydere', 'https://www.openstreetmap.org/copyright'],
      ...SOURCES.slice(2),
    ])
  })
})
