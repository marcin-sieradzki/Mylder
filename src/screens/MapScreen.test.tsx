import '@mylder/perron/tokens.css'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveSnapshot } from '../map/live'
import { readPaint } from '../map/paint'
import { vehiclePaint, vehiclesOf } from '../map/vehicles'
import { mapView } from '../map/view'
import type { Snapshot } from '../tracker/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// The map itself draws with WebGL, which jsdom lacks; the end-to-end test sees its canvas.

/** A saved snapshot of a recording: the weekday's, or one where the month's calls ran out. */
const saved = (name: string, recording = 'weekday'): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', recording, 'snapshots', name), 'utf8'),
  ) as Snapshot

const renderScreen = (lang: Lang) =>
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )

/**
 * The timetable routes as the server answers them on the recording: each version's files from its
 * `timetable/` folder. jsdom has no server to reach.
 */
const timetableRoutes = async (input: RequestInfo | URL): Promise<Response> => {
  const folder = join(process.cwd(), 'recordings', 'weekday', 'timetable')
  const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8')) as {
    version: string
    files: Record<string, string>
  }
  const [, version, file] = /^\/api\/timetable\/([^/]+)\/(\w+)$/.exec(String(input)) ?? []
  if (version !== manifest.version) return new Response(null, { status: 404 })
  const body =
    file === 'manifest'
      ? JSON.stringify(manifest)
      : readFileSync(join(folder, manifest.files[file]), 'utf8')
  return new Response(body, { headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/en')
  vi.stubGlobal('fetch', timetableRoutes)
})

afterEach(() => {
  liveSnapshot.update({ snapshot: undefined, failingSince: undefined })
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
    act(() => liveSnapshot.update({ snapshot: saved('0001.json') }))
    renderScreen('en')
    expect(within(screen.getByRole('banner')).getByText('Updated 07:20:00')).toBeInTheDocument()
  })

  it('moves the time on with each snapshot built from an answer, in Danish', () => {
    act(() => liveSnapshot.update({ snapshot: saved('0001.json') }))
    renderScreen('da')
    const banner = screen.getByRole('banner')
    expect(within(banner).getByText('Opdateret 07:20:00')).toBeInTheDocument()
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    expect(within(banner).getByText('Opdateret 07:25:00')).toBeInTheDocument()
  })

  it('keeps the last answer time while Rejseplanen gives none or the page is disconnected', () => {
    act(() => liveSnapshot.update({ snapshot: saved('0001.json') }))
    renderScreen('da')
    const banner = screen.getByRole('banner')
    // The month's calls ran out a minute later: that snapshot was built from no answer.
    act(() => liveSnapshot.update({ snapshot: saved('0002.json', 'spent') }))
    expect(within(banner).getByText('Opdateret 07:20:00')).toBeInTheDocument()
    act(() => liveSnapshot.update({ failingSince: Date.parse('2026-06-16T05:23:00Z') }))
    expect(within(banner).getByText('Opdateret 07:20:00')).toBeInTheDocument()
  })

  it("has a chip for each of the timetable's modes, counting the trips underway in it", async () => {
    // The sixth minute: 6 buses underway and a seventh waiting at its first stop, 4 Metro trains,
    // 6 S-trains and 1 regional train. The recording's timetable runs no light rail.
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('en')
    const modes = await screen.findByRole('group', { name: 'Modes' })
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
    const modes = await screen.findByRole('group', { name: 'Transportformer' })
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
    const modes = await screen.findByRole('group', { name: 'Modes' })
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
    const modes = await screen.findByRole('group', { name: 'Transportformer' })
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

  it('names every control on the bar, the About button too', async () => {
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('da')
    const banner = screen.getByRole('banner')
    await within(banner).findByRole('group', { name: 'Transportformer' })
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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(about).toHaveFocus()
  })

  it('shows no time before a snapshot built from an answer has landed', () => {
    act(() => liveSnapshot.update({ snapshot: saved('0001.json', 'spent') }))
    renderScreen('en')
    expect(within(screen.getByRole('banner')).getByText('Updated —')).toBeInTheDocument()
  })
})
