import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveSnapshot } from '../map/live'
import { pickedVehicle } from '../map/picking'
import type { Snapshot } from '../tracker/index'
import { Providers } from './Providers'
import { VehicleCard } from './VehicleCard'

const saved = (name: string): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', 'weekday', 'snapshots', name), 'utf8'),
  ) as Snapshot

// The sixth minute, fetched at 07:25:00 in Copenhagen: reports every other poll of 60 s, so a
// report keeps a trip Live for 240 s and Ageing until 300 s.
const minute6 = saved('0006.json')
const A_LIVE = 's-tog.A.0bc307e3eb.20260616.0707'
const BUS_ESTIMATED = 'bus.5C.32331e0e20.20260616.0707'
const M1_TIMETABLE = 'metro.M1.7f21f99145.20260616.0703'
/** Waiting at its first stop, Timetable only, leaving at 07:30. */
const BUS_WAITING = 'bus.991.7ce514fd98.20260616.0730'

/** Opens the card on `key`, as a hover does, with the server's clock `seconds` after the fetch. */
function openCard(lang: Lang, key: string, seconds: number) {
  vi.setSystemTime(minute6.fetched + seconds * 1000)
  liveSnapshot.update({ snapshot: minute6, clockOffset: 0 })
  pickedVehicle.pick({ kind: 'trip', key, point: [200, 200] })
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <VehicleCard />
    </Providers>,
  )
}

const card = () => screen.getByRole('tooltip')

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  // jsdom has no server: the timetable stays on its way, so the card reads Copenhagen's clock.
  vi.stubGlobal('fetch', () => new Promise(() => {}))
})

afterEach(() => {
  pickedVehicle.clear()
  liveSnapshot.update({ snapshot: undefined })
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("a dot's card", () => {
  it("names the line and where it is going, and how long ago a Live trip's vehicle reported", () => {
    openCard('en', A_LIVE, 20)
    expect(card()).toHaveTextContent('S-tog A to Hillerød St.')
    expect(card()).toHaveTextContent('Live')
    expect(card()).toHaveTextContent('Reported 20 s ago')
  })

  it('ages its label by the clock, with no poll', () => {
    openCard('en', A_LIVE, 20)
    act(() => vi.advanceTimersByTime(5_000))
    expect(card()).toHaveTextContent('Reported 25 s ago')
    act(() => vi.advanceTimersByTime(225_000))
    expect(card()).toHaveTextContent('Ageing')
    expect(card()).toHaveTextContent('Last seen 4 min ago')
    act(() => vi.advanceTimersByTime(60_000))
    expect(card()).toHaveTextContent('No signal')
    expect(card()).toHaveTextContent('No signal since 07:25')
  })

  it('says an Estimated trip is estimated from the schedule', () => {
    openCard('en', BUS_ESTIMATED, 20)
    expect(card()).toHaveTextContent('Bus 5C to Husum Torv')
    expect(card()).toHaveTextContent('Estimated')
    expect(card()).toHaveTextContent('Estimated from schedule')
  })

  it('says a Timetable only trip is timetable only, once', () => {
    openCard('en', M1_TIMETABLE, 20)
    expect(card()).toHaveTextContent('Metro M1 to Vestamager St. (Metro)')
    expect(card().textContent?.match(/Timetable only/g)).toHaveLength(1)
  })

  it('gives a Waiting trip its departure time, never that it is there', () => {
    openCard('en', BUS_WAITING, 20)
    expect(card()).toHaveTextContent('Bus 991 to Teglholmen')
    expect(card()).toHaveTextContent('Timetable only')
    expect(card()).toHaveTextContent('Departs 07:30')
  })

  it('says the same in Danish', () => {
    openCard('da', A_LIVE, 20)
    expect(card()).toHaveTextContent('S-tog A mod Hillerød St.')
    expect(card()).toHaveTextContent('Meldt for 20 s siden')
    act(() => vi.advanceTimersByTime(230_000))
    expect(card()).toHaveTextContent('Ældre')
    expect(card()).toHaveTextContent('Sidst set for 4 min siden')
    act(() => vi.advanceTimersByTime(60_000))
    expect(card()).toHaveTextContent('Intet signal siden 07:25')
  })

  it('reads every other state in Danish', () => {
    openCard('da', BUS_ESTIMATED, 20)
    expect(card()).toHaveTextContent('Bus 5C mod Husum Torv')
    expect(card()).toHaveTextContent('Beregnet ud fra køreplanen')
    act(() => pickedVehicle.pick({ kind: 'trip', key: BUS_WAITING, point: [200, 200] }))
    expect(card()).toHaveTextContent('Kun køreplan')
    expect(card()).toHaveTextContent('Afgår 07:30')
  })

  it('lets the pointer through to the map, so it never hides its dot', () => {
    openCard('en', A_LIVE, 20)
    // The card opens 8 px from its dot, and a dot is picked from 12 px: over the card, the pointer
    // must still be over the map, or the map hears it leave and the card closes, and a tap must
    // still reach the dot to open its detail.
    expect(getComputedStyle(card()).pointerEvents).toBe('none')
  })

  it('opens on no aircraft, whose card is its own', () => {
    openCard('en', A_LIVE, 20)
    act(() => pickedVehicle.pick({ kind: 'aircraft', key: A_LIVE, point: [200, 200] }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('closes on Esc', () => {
    openCard('en', A_LIVE, 20)
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
