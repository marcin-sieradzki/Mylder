import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveAircraft } from '../map/aircraft'
import { pickedVehicle } from '../map/picking'
import type { AircraftSnapshot } from '../tracker/aircraft/index'
import { AircraftCard } from './AircraftCard'
import { Providers } from './Providers'

const saved = (name: string): AircraftSnapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', name), 'utf8'),
  ) as AircraftSnapshot

// The sixth aircraft snapshot, fetched at 07:20:50 in Copenhagen.
const sixth = saved('0006.json')
/** SAS9PU, an A20N at 11 000 ft and 320 kt, its own position broadcast 0.7 s before the fetch. */
const SAS9PU = '4ab1e3'
/** OY-JRV, a BE20 at 6 000 ft and 210 kt, placed by multilateration 0.9 s before the fetch. */
const OYJRV = '45c8d4'
/** EDW62L, an A320 last placed at 11 750 ft 124.3 s before the fetch, at 07:18:45, with no speed. */
const EDW62L = '4b1a07'
/** SAS951, an A359 standing on the ground. */
const SAS951 = '45ac9d'
/** An A20N on the ground that sends no callsign. */
const NO_CALLSIGN = '4aca12'

/** Opens the card on `hex`, as a hover does, with the server's clock `seconds` after the fetch. */
function openCard(lang: Lang, hex: string, seconds: number, snapshot = sixth) {
  vi.setSystemTime(snapshot.fetched + seconds * 1000)
  liveAircraft.update({ snapshot, clockOffset: 0 })
  pickedVehicle.pick({ kind: 'aircraft', key: hex, point: [200, 200] })
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <AircraftCard />
    </Providers>,
  )
}

const card = () => screen.getByRole('tooltip')

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
})

afterEach(() => {
  pickedVehicle.clear()
  liveAircraft.update({ snapshot: undefined })
  vi.useRealTimers()
})

describe("a plane's card", () => {
  it('names a Live plane by its callsign, with its type, altitude, speed and how long ago it reported', () => {
    openCard('en', SAS9PU, 4)
    expect(card()).toHaveTextContent('SAS9PU')
    expect(card()).toHaveTextContent('A20N')
    expect(card()).toHaveTextContent('3 350 m')
    expect(card()).toHaveTextContent('593 km/h')
    expect(card()).toHaveTextContent('Live')
    expect(card()).toHaveTextContent('Reported 4 s ago')
  })

  it('ages its label from Live to Ageing by the clock, with no poll', () => {
    openCard('en', SAS9PU, 15)
    expect(card()).toHaveTextContent('Reported 15 s ago')
    act(() => vi.advanceTimersByTime(5_000))
    expect(card()).toHaveTextContent('Ageing')
    expect(card()).toHaveTextContent('Last seen 20 s ago')
  })

  it('says the ground receivers placed an Estimated plane', () => {
    openCard('en', OYJRV, 5)
    expect(card()).toHaveTextContent('OYJRV')
    expect(card()).toHaveTextContent('BE20 · 1 830 m · 389 km/h')
    expect(card()).toHaveTextContent('Estimated')
    expect(card()).toHaveTextContent('Placed by ground receivers 5 s ago')
  })

  it('gives a No signal plane the time of its last position, and leaves out the speed it lacks', () => {
    openCard('en', EDW62L, 5)
    expect(card()).toHaveTextContent('EDW62L')
    expect(card()).toHaveTextContent(/^EDW62LA320 · 3 580 mNo signal/)
    expect(card()).toHaveTextContent('No signal since 07:18')
  })

  it('says a plane on the ground is on the ground, not at an altitude', () => {
    openCard('en', SAS951, 4)
    expect(card()).toHaveTextContent('SAS951')
    expect(card()).toHaveTextContent('A359 · On the ground · 0 km/h')
  })

  it('names a plane that sends no callsign by its hex', () => {
    openCard('en', NO_CALLSIGN, 4)
    expect(card()).toHaveTextContent(/^4aca12A20N · On the ground · 0 km\/hLive/)
  })

  it('says the same in Danish', () => {
    openCard('da', SAS9PU, 15)
    expect(card()).toHaveTextContent('SAS9PU')
    expect(card()).toHaveTextContent('A20N · 3 350 m · 593 km/t')
    expect(card()).toHaveTextContent('Meldt for 15 s siden')
    act(() => vi.advanceTimersByTime(5_000))
    expect(card()).toHaveTextContent('Ældre')
    expect(card()).toHaveTextContent('Sidst set for 20 s siden')
  })

  it('reads every other state in Danish', () => {
    openCard('da', OYJRV, 5)
    expect(card()).toHaveTextContent('Beregnet')
    expect(card()).toHaveTextContent('Placeret af modtagere på jorden for 5 s siden')
    act(() => pickedVehicle.pick({ kind: 'aircraft', key: EDW62L, point: [200, 200] }))
    expect(card()).toHaveTextContent('Intet signal siden 07:18')
    act(() => pickedVehicle.pick({ kind: 'aircraft', key: NO_CALLSIGN, point: [200, 200] }))
    expect(card()).toHaveTextContent('4aca12')
    expect(card()).toHaveTextContent('A20N · På jorden · 0 km/t')
  })

  it('opens on no vehicle, whose card is its own', () => {
    openCard('en', SAS9PU, 4)
    act(() => pickedVehicle.pick({ kind: 'trip', key: SAS9PU, point: [200, 200] }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('closes on Esc', () => {
    openCard('en', SAS9PU, 4)
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
