import { act, cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveAircraft } from '../map/aircraft'
import type { AircraftSnapshot } from '../tracker/aircraft/index'
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

/** The weekday recording's first aircraft snapshot, as the aircraft route answers it. */
const recordedAircraft = JSON.parse(
  readFileSync(
    join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', '0001.json'),
    'utf8',
  ),
) as AircraftSnapshot

afterEach(() => {
  act(() => liveAircraft.update({ snapshot: undefined }))
})

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

  it('credits adsb.lol for the aircraft once they are on the map, in English and Danish', () => {
    act(() => liveAircraft.update({ snapshot: { ...recordedAircraft, provider: 'adsb.lol' } }))
    const credit = show('en')
    expect(credit).toHaveTextContent(
      'Transit data: Rejseplanen (CC BY 4.0) · Aircraft: © adsb.lol contributors under the ODbL · © OpenStreetMap contributors · © OpenMapTiles · OpenFreeMap',
    )
    expect(links().slice(2, 4)).toEqual([
      ['© adsb.lol contributors', 'https://adsb.lol/'],
      ['ODbL', 'https://opendatacommons.org/licenses/odbl/'],
    ])
    cleanup()
    expect(show('da')).toHaveTextContent(
      'Trafikdata: Rejseplanen (CC BY 4.0) · Fly: © adsb.lol-bidragydere under ODbL · © OpenStreetMap-bidragydere · © OpenMapTiles · OpenFreeMap',
    )
  })

  it('credits adsb.fi with a link to its home page when it answered, in English and Danish', () => {
    act(() => liveAircraft.update({ snapshot: { ...recordedAircraft, provider: 'adsb.fi' } }))
    expect(show('en')).toHaveTextContent(
      'Transit data: Rejseplanen (CC BY 4.0) · Aircraft: © adsb.fi · © OpenStreetMap contributors · © OpenMapTiles · OpenFreeMap',
    )
    expect(links().slice(2, 3)).toEqual([['© adsb.fi', 'https://adsb.fi/']])
    cleanup()
    expect(show('da')).toHaveTextContent(
      'Trafikdata: Rejseplanen (CC BY 4.0) · Fly: © adsb.fi · © OpenStreetMap-bidragydere · © OpenMapTiles · OpenFreeMap',
    )
  })

  it('credits adsb.lol for recorded aircraft too', () => {
    act(() => liveAircraft.update({ snapshot: recordedAircraft }))
    expect(show('en')).toHaveTextContent('Aircraft: © adsb.lol contributors under the ODbL')
  })
})
