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

// The weekday recording's last aircraft snapshot, fetched at 19:56:03 in Copenhagen.
const last = saved('0018.json')
/** SAS506, an A20N at 5 075 ft and 263.4 kt, its own position broadcast 0.1 s before the fetch. */
const SAS506 = '4caf7e'
/** An SF34 at 9 425 ft and 72 kt, placed by multilateration 1.4 s before the fetch, with no callsign. */
const PLACED = '511196'
/** NSZ3213, a B738 just landed, taxiing at 21.5 kt. */
const NSZ3213 = '47873f'
/** A B738 on the ground that sends no callsign, its own position 54.1 s old at the fetch. */
const NO_CALLSIGN = '45ab23'
/**
 * The seventh snapshot, fetched at 19:54:13: DNU53K, an AT76 just landed, last placed at 50 ft
 * 58.5 s before the fetch, at 19:53:15, with no speed.
 */
const seventh = saved('0007.json')
const DNU53K = '45caad'

/** Opens the card on `hex`, as a hover does, with the server's clock `seconds` after the fetch. */
function openCard(lang: Lang, hex: string, seconds: number, snapshot = last) {
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
    openCard('en', SAS506, 4)
    expect(card()).toHaveTextContent('SAS506')
    expect(card()).toHaveTextContent('A20N')
    expect(card()).toHaveTextContent('1 550 m')
    expect(card()).toHaveTextContent('488 km/h')
    expect(card()).toHaveTextContent('Live')
    expect(card()).toHaveTextContent('Reported 4 s ago')
  })

  it('ages its label from Live to Ageing by the clock, with no poll', () => {
    openCard('en', SAS506, 15)
    expect(card()).toHaveTextContent('Reported 15 s ago')
    // The label ticks on the server's whole seconds, half a second after this fetch.
    act(() => vi.advanceTimersByTime(6_000))
    expect(card()).toHaveTextContent('Ageing')
    expect(card()).toHaveTextContent('Last seen 20 s ago')
  })

  it('says the ground receivers placed an Estimated plane', () => {
    openCard('en', PLACED, 5)
    expect(card()).toHaveTextContent('SF34 · 2 870 m · 133 km/h')
    expect(card()).toHaveTextContent('Estimated')
    expect(card()).toHaveTextContent('Placed by ground receivers 6 s ago')
  })

  it('gives a No signal plane the time of its last position, and leaves out the speed it lacks', () => {
    openCard('en', DNU53K, 5, seventh)
    expect(card()).toHaveTextContent(/^DNU53KAT76 · 20 mNo signal/)
    expect(card()).toHaveTextContent('No signal since 19:53')
  })

  it('says a plane on the ground is on the ground, not at an altitude', () => {
    openCard('en', NSZ3213, 4)
    expect(card()).toHaveTextContent('NSZ3213')
    expect(card()).toHaveTextContent('B738 · On the ground · 40 km/h')
  })

  it('names a plane that sends no callsign by its hex', () => {
    openCard('en', NO_CALLSIGN, 4)
    expect(card()).toHaveTextContent(/^45ab23B738 · On the ground · 21 km\/hAgeing/)
  })

  it('names a plane whose callsign the feed hasn’t heard by its hex', () => {
    openCard('en', PLACED, 5)
    expect(card()).toHaveTextContent(/^511196SF34/)
  })

  it('says the same in Danish', () => {
    openCard('da', SAS506, 15)
    expect(card()).toHaveTextContent('SAS506')
    expect(card()).toHaveTextContent('A20N · 1 550 m · 488 km/t')
    expect(card()).toHaveTextContent('Meldt for 15 s siden')
    act(() => vi.advanceTimersByTime(6_000))
    expect(card()).toHaveTextContent('Ældre')
    expect(card()).toHaveTextContent('Sidst set for 20 s siden')
  })

  it('reads every other state in Danish', () => {
    openCard('da', PLACED, 7)
    expect(card()).toHaveTextContent('Beregnet')
    expect(card()).toHaveTextContent('Placeret af modtagere på jorden for 8 s siden')
    // Its own position 61.1 s old now, from 19:55:09.
    act(() => pickedVehicle.pick({ kind: 'aircraft', key: NO_CALLSIGN, point: [200, 200] }))
    expect(card()).toHaveTextContent('45ab23')
    expect(card()).toHaveTextContent('Intet signal siden 19:55')
    act(() => pickedVehicle.pick({ kind: 'aircraft', key: NSZ3213, point: [200, 200] }))
    expect(card()).toHaveTextContent('B738 · På jorden · 40 km/t')
  })

  it('opens on no vehicle, whose card is its own', () => {
    openCard('en', SAS506, 4)
    act(() => pickedVehicle.pick({ kind: 'trip', key: SAS506, point: [200, 200] }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('closes on Esc', () => {
    openCard('en', SAS506, 4)
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
