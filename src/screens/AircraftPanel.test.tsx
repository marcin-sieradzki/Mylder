import '@mylder/perron/tokens.css'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveAircraft } from '../map/aircraft'
import { mapView, openPanel } from '../map/view'
import type { AircraftSnapshot } from '../tracker/aircraft/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

const saved = (name: string): AircraftSnapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', name), 'utf8'),
  ) as AircraftSnapshot

// The sixth aircraft snapshot, fetched at 07:20:50 in Copenhagen, and the ninth, 30 s later.
const sixth = saved('0006.json')
const ninth = saved('0009.json')
/** SAS9PU, an A20N at 11 000 ft and 320 kt, its own position broadcast 0.7 s before the fetch. */
const SAS9PU = '4ab1e3'
/** An A20N on the ground that sends no callsign. */
const NO_CALLSIGN = '4aca12'

/**
 * Opens the panel of `hex` from the address in `lang`, as a tap on its plane does, with the
 * server's clock `seconds` after the sixth snapshot's fetch.
 */
function openAircraft(lang: Lang, hex: string, seconds: number) {
  vi.setSystemTime(sixth.fetched + seconds * 1000)
  liveAircraft.update({ snapshot: sixth, clockOffset: 0 })
  window.history.replaceState(null, '', `/${lang}?aircraft=${hex}`)
  return render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  // jsdom has no server: every route stays on its way.
  vi.stubGlobal('fetch', () => new Promise(() => {}))
})

afterEach(() => {
  act(() => openPanel(undefined))
  liveAircraft.update({ snapshot: undefined })
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe("a plane's panel", () => {
  it('says what its card says, named by its callsign', () => {
    openAircraft('en', SAS9PU, 4)
    const panel = screen.getByRole('dialog', { name: 'SAS9PU' })
    expect(panel).toHaveTextContent('A20N · 3 350 m · 593 km/h')
    expect(panel).toHaveTextContent('Live')
    expect(panel).toHaveTextContent('Reported 4 s ago')
  })

  it('ages its label by the clock, with no poll', () => {
    openAircraft('en', SAS9PU, 15)
    const panel = screen.getByRole('dialog', { name: 'SAS9PU' })
    expect(panel).toHaveTextContent('Reported 15 s ago')
    act(() => vi.advanceTimersByTime(5_000))
    expect(panel).toHaveTextContent('Last seen 20 s ago')
  })

  it('is named by the hex of a plane that sends no callsign', () => {
    openAircraft('en', NO_CALLSIGN, 4)
    const panel = screen.getByRole('dialog', { name: '4aca12' })
    expect(panel).toHaveTextContent('A20N · On the ground · 0 km/h')
  })

  it('says so once the plane has left the snapshot', () => {
    openAircraft('en', SAS9PU, 4)
    expect(ninth.aircraft.map((each) => each.hex)).toContain(SAS9PU)
    act(() =>
      liveAircraft.update({
        snapshot: { ...ninth, aircraft: ninth.aircraft.filter((each) => each.hex !== SAS9PU) },
      }),
    )
    const panel = screen.getByRole('dialog', { name: 'Plane not on the map' })
    expect(panel).toHaveTextContent('The planes feed no longer places it over Copenhagen.')
  })

  it('closes on its close button, and leaves the address', () => {
    openAircraft('en', SAS9PU, 4)
    const panel = screen.getByRole('dialog', { name: 'SAS9PU' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    expect(mapView.get().panel).toBeUndefined()
    expect(window.location.search).toBe('')
  })

  it('closes on Esc', () => {
    openAircraft('en', SAS9PU, 4)
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'SAS9PU' }), { key: 'Escape' })
    expect(mapView.get().panel).toBeUndefined()
  })

  it('gives way to a vehicle or a stop opened after it, one panel at a time', () => {
    openAircraft('en', SAS9PU, 4)
    act(() => openPanel({ kind: 'stop', id: '27532' }))
    expect(screen.queryByRole('dialog', { name: 'SAS9PU' })).not.toBeInTheDocument()
    expect(window.location.search).toBe('?stop=27532')
  })

  it('says the same in Danish', () => {
    openAircraft('da', SAS9PU, 15)
    const panel = screen.getByRole('dialog', { name: 'SAS9PU' })
    expect(panel).toHaveTextContent('A20N · 3 350 m · 593 km/t')
    expect(panel).toHaveTextContent('Meldt for 15 s siden')
    act(() => vi.advanceTimersByTime(5_000))
    expect(panel).toHaveTextContent('Ældre')
    expect(panel).toHaveTextContent('Sidst set for 20 s siden')
    act(() => liveAircraft.update({ snapshot: { ...ninth, aircraft: [] } }))
    expect(screen.getByRole('dialog', { name: 'Flyet er ikke på kortet' })).toHaveTextContent(
      'Flydata placerer det ikke længere over København.',
    )
  })
})
