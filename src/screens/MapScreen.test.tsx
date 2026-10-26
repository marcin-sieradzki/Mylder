import '@mylder/perron/tokens.css'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveAircraft } from '../map/aircraft'
import { liveSnapshot } from '../map/live'
import { readPaint } from '../map/paint'
import { vehiclePaint, vehiclesOf } from '../map/vehicles'
import { mapView } from '../map/view'
import { timetableRoutes } from '../test/timetableRoutes'
import type { AircraftSnapshot } from '../tracker/aircraft/index'
import type { Snapshot } from '../tracker/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// The map itself draws with WebGL, which jsdom lacks; the end-to-end test sees its canvas.

/** A saved snapshot of a recording: the weekday's, or one where the month's calls ran out. */
const saved = (name: string, recording = 'weekday'): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', recording, 'snapshots', name), 'utf8'),
  ) as Snapshot

/** The aircraft source's snapshot of a call in the weekday recording. */
const savedAircraft = (name: string): AircraftSnapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', name), 'utf8'),
  ) as AircraftSnapshot

/** An aircraft snapshot landed, with the aircraft server's clock `after` ms past its fetch. */
const landAircraft = (snapshot: AircraftSnapshot, after = 2_000) =>
  act(() => liveAircraft.update({ snapshot, clockOffset: snapshot.fetched + after - Date.now() }))

/** A snapshot landed, with the server's clock `after` ms past its fetch. */
const land = (snapshot: Snapshot, after = 20_000) =>
  act(() => liveSnapshot.update({ snapshot, clockOffset: snapshot.fetched + after - Date.now() }))

const renderScreen = (lang: Lang) =>
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )

beforeEach(() => {
  window.history.replaceState(null, '', '/en')
  vi.stubGlobal('fetch', timetableRoutes)
})

afterEach(() => {
  liveSnapshot.update({ snapshot: undefined, failingSince: undefined, clockOffset: 0 })
  liveAircraft.update({ snapshot: undefined, off: undefined })
  vi.unstubAllGlobals()
})

describe('the map screen', () => {
  it('keeps the brand and the language switch over the map, in English', () => {
    renderScreen('en')
    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('link', { name: 'Mylder' })).toHaveAttribute('href', '/en')
    const languages = within(banner).getByRole('navigation', { name: 'Language' })
    expect(within(languages).getByRole('link', { name: 'Dansk' })).toHaveAttribute('hreflang', 'da')
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('says the same in Danish', () => {
    renderScreen('da')
    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('link', { name: 'Mylder' })).toHaveAttribute('href', '/da')
    const languages = within(banner).getByRole('navigation', { name: 'Sprog' })
    expect(within(languages).getByRole('link', { name: 'English' })).toHaveAttribute(
      'hreflang',
      'en',
    )
  })
})

describe('the top bar', () => {
  it('says when the positions are from, to the second, in Copenhagen time', () => {
    // The recording's first minute was fetched at 05:20:00 UTC, 07:20:00 in Copenhagen's summer.
    land(saved('0001.json'))
    renderScreen('en')
    expect(within(screen.getByRole('banner')).getByText('Updated 07:20:00')).toBeInTheDocument()
  })

  it('moves the time on with each snapshot built from an answer, in Danish', () => {
    land(saved('0001.json'))
    renderScreen('da')
    const banner = screen.getByRole('banner')
    expect(within(banner).getByText('Opdateret 07:20:00')).toBeInTheDocument()
    land(saved('0006.json'))
    expect(within(banner).getByText('Opdateret 07:25:00')).toBeInTheDocument()
  })

  it('keeps the last answer time while Rejseplanen gives none or the page is disconnected', () => {
    land(saved('0001.json'))
    renderScreen('da')
    const banner = screen.getByRole('banner')
    // The month's calls ran out a minute later: that snapshot was built from no answer, and the
    // page is Paused.
    act(() => liveSnapshot.update({ snapshot: saved('0002.json', 'spent') }))
    expect(within(banner).getByText('Opdateret 07:20:00, sat på pause')).toBeInTheDocument()
    act(() => liveSnapshot.update({ failingSince: Date.parse('2026-06-16T05:23:00Z') }))
    expect(within(banner).getByText('Opdateret 07:20:00, sat på pause')).toBeInTheDocument()
  })

  it('adds "may be out of date" once the snapshot is older than its poll interval, by the server clock', () => {
    // The minute's snapshot was fetched at 07:20:00 and polls every 60 s; the next is due at
    // 07:21:00, and the browser's poll brings it a few seconds after.
    land(saved('0001.json'), 59_000)
    renderScreen('en')
    const banner = screen.getByRole('banner')
    expect(within(banner).getByText('Updated 07:20:00')).toBeInTheDocument()
    land(saved('0001.json'), 75_000)
    expect(within(banner).getByText('Updated 07:20:00, may be out of date')).toBeInTheDocument()
  })

  it('says so in Danish, and leaves it to the page notice while the page is disconnected', () => {
    land(saved('0001.json'), 75_000)
    renderScreen('da')
    const banner = screen.getByRole('banner')
    expect(within(banner).getByText('Opdateret 07:20:00, måske forældet')).toBeInTheDocument()
    act(() => liveSnapshot.update({ failingSince: Date.now() - 30_000 }))
    expect(within(banner).getByText('Opdateret 07:20:00')).toBeInTheDocument()
  })

  it("has a chip for each of the timetable's modes, counting the trips underway in it", async () => {
    // The sixth minute: 6 buses underway and a seventh waiting at its first stop, 4 Metro trains,
    // 6 S-trains and 1 regional train. The recording's timetable runs no light rail.
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('en')
    const modes = await screen.findByRole('group', { name: 'Filters' })
    const chips = within(modes).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'Bus 6',
      'Metro 4',
      'S-tog 6',
      'Train 1',
    ])
    for (const chip of chips) expect(chip).toHaveAttribute('aria-pressed', 'true')
  })

  it('names the modes in Danish', async () => {
    act(() => liveSnapshot.update({ snapshot: saved('0007.json') }))
    renderScreen('da')
    const modes = await screen.findByRole('group', { name: 'Filtre' })
    expect(
      within(modes)
        .getAllByRole('button')
        .map((chip) => chip.textContent),
    ).toEqual(['Bus 6', 'Metro 2', 'S-tog 6', 'Tog 1'])
  })

  it("takes a mode's dots off the map when its chip is turned off, and keeps every count", async () => {
    const snapshot = saved('0006.json')
    act(() => liveSnapshot.update({ snapshot }))
    renderScreen('en')
    const modes = await screen.findByRole('group', { name: 'Filters' })
    const drawn = () =>
      vehiclesOf(
        snapshot,
        undefined,
        readPaint(document.documentElement, vehiclePaint()),
        undefined,
        {
          hidden: mapView.get().hidden,
        },
      ).length
    expect(drawn()).toBe(18)

    fireEvent.click(within(modes).getByRole('button', { name: 'Bus 6' }))
    expect(within(modes).getByRole('button', { name: 'Bus 6' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    // The 6 buses underway and the one waiting leave the map; the count is the city's, unfiltered.
    expect(drawn()).toBe(11)
    expect(window.location.search).toBe('?hide=bus')

    fireEvent.click(within(modes).getByRole('button', { name: 'Train 1' }))
    expect(drawn()).toBe(10)
    fireEvent.click(within(modes).getByRole('button', { name: 'Bus 6' }))
    expect(drawn()).toBe(17)
    expect(window.location.search).toBe('?hide=train')
  })

  it('reads the filters from the address, in Danish', async () => {
    window.history.replaceState(null, '', '/da?hide=metro,s-tog&line=5C')
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('da')
    const modes = await screen.findByRole('group', { name: 'Filtre' })
    const pressed = within(modes)
      .getAllByRole('button')
      .map((chip) => [chip.textContent, chip.getAttribute('aria-pressed')])
    expect(pressed).toEqual([
      ['Bus 6', 'true'],
      ['Metro 4', 'false'],
      ['S-tog 6', 'false'],
      ['Tog 1', 'true'],
    ])
  })

  it('has a Planes chip after the modes, counting the aircraft in the box', async () => {
    // The sixth call holds 9 aircraft over Copenhagen.
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    landAircraft(savedAircraft('0006.json'))
    renderScreen('en')
    const filters = await screen.findByRole('group', { name: 'Filters' })
    const chips = within(filters).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'Bus 6',
      'Metro 4',
      'S-tog 6',
      'Train 1',
      'Planes 9',
    ])
    expect(within(filters).getByRole('button', { name: 'Planes 9' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('names the Planes chip in Danish, and counts the aircraft of the latest answer', async () => {
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    landAircraft(savedAircraft('0001.json'))
    renderScreen('da')
    const filters = await screen.findByRole('group', { name: 'Filtre' })
    expect(within(filters).getByRole('button', { name: 'Fly 8' })).toBeInTheDocument()
    landAircraft(savedAircraft('0006.json'))
    expect(within(filters).getByRole('button', { name: 'Fly 9' })).toBeInTheDocument()
  })

  it('counts the aircraft the map draws, less one whose position the clock has dropped', async () => {
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    const sixth = savedAircraft('0006.json')
    // One position 299 s old at the fetch is 5 min old 1 s later, and leaves the map.
    const [old, ...rest] = sixth.aircraft
    landAircraft({ ...sixth, aircraft: [{ ...old, age: 299 }, ...rest] })
    renderScreen('en')
    const filters = await screen.findByRole('group', { name: 'Filters' })
    expect(within(filters).getByRole('button', { name: 'Planes 8' })).toBeInTheDocument()
  })

  it('has no Planes chip while the aircraft are off, or before their first answer', async () => {
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('en')
    const filters = await screen.findByRole('group', { name: 'Filters' })
    expect(within(filters).queryByRole('button', { name: /^Planes/ })).not.toBeInTheDocument()
    act(() => liveAircraft.update({ off: true }))
    expect(within(filters).getAllByRole('button')).toHaveLength(4)
  })

  it('has no Fly chip while the aircraft are off, though the address hides them', async () => {
    window.history.replaceState(null, '', '/da?hide=aircraft')
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    act(() => liveAircraft.update({ snapshot: savedAircraft('0006.json'), off: true }))
    renderScreen('da')
    const filters = await screen.findByRole('group', { name: 'Filtre' })
    expect(within(filters).queryByRole('button', { name: /^Fly/ })).not.toBeInTheDocument()
  })

  it('turns the planes off and on in the address, with no count while they are off', async () => {
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    landAircraft(savedAircraft('0006.json'))
    renderScreen('en')
    const filters = await screen.findByRole('group', { name: 'Filters' })
    fireEvent.click(within(filters).getByRole('button', { name: 'Planes 9' }))
    // Off, the page no longer asks for the aircraft, so the count it last had is no longer theirs.
    const planes = within(filters).getByRole('button', { name: 'Planes' })
    expect(planes).toHaveAttribute('aria-pressed', 'false')
    expect(window.location.search).toBe('?hide=aircraft')
    fireEvent.click(within(filters).getByRole('button', { name: 'Bus 6' }))
    expect(window.location.search).toBe('?hide=bus,aircraft')
    fireEvent.click(planes)
    expect(within(filters).getByRole('button', { name: 'Planes 9' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(window.location.search).toBe('?hide=bus')
  })

  it('has the Fly chip off from the address before any answer, to turn them on again', async () => {
    window.history.replaceState(null, '', '/da?hide=aircraft')
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('da')
    const filters = await screen.findByRole('group', { name: 'Filtre' })
    expect(within(filters).getByRole('button', { name: 'Fly' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('names every control on the bar, the About button too', async () => {
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('da')
    const banner = screen.getByRole('banner')
    await within(banner).findByRole('group', { name: 'Filtre' })
    expect(within(banner).getByRole('button', { name: 'Om Mylder' })).toBeInTheDocument()
    const controls = [
      ...within(banner).getAllByRole('button'),
      ...within(banner).getAllByRole('link'),
    ]
    expect(controls).toHaveLength(7)
    for (const control of controls) expect(control).toHaveAccessibleName()
  })

  it('opens the About dialog from the bar’s About button, and Esc gives it the focus back', async () => {
    const user = userEvent.setup()
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('en')
    const about = within(screen.getByRole('banner')).getByRole('button', { name: 'About Mylder' })
    await user.click(about)
    expect(await screen.findByRole('dialog', { name: 'About Mylder' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'About Mylder' })).not.toBeInTheDocument()
    expect(about).toHaveFocus()
    // The sheet beside the map stays open: the Esc was the dialog's.
    expect(screen.getByRole('dialog', { name: 'Overview' })).toBeInTheDocument()
  })

  it('shows no time before a snapshot built from an answer has landed', () => {
    act(() => liveSnapshot.update({ snapshot: saved('0001.json', 'spent') }))
    renderScreen('en')
    expect(within(screen.getByRole('banner')).getByText('Updated —, paused')).toBeInTheDocument()
  })
})
