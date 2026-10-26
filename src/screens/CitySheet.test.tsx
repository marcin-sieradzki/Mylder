import '@mylder/perron/tokens.css'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveSnapshot } from '../map/live'
import type { Snapshot } from '../tracker/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

/** A saved snapshot of the weekday recording. */
const saved = (name: string): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', 'weekday', 'snapshots', name), 'utf8'),
  ) as Snapshot

const renderScreen = (lang: Lang) =>
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )

/** Makes the page as wide as a phone, under Perron's breakpoint.phone, or as a desktop. */
const widthOf = (phone: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))

const sheet = () => screen.getByRole('dialog')
const tabs = (name: string) => within(sheet()).getByRole('tablist', { name })

beforeEach(() => {
  window.history.replaceState(null, '', '/en')
  // jsdom has no server: the timetable stays on its way.
  vi.stubGlobal('fetch', () => new Promise(() => {}))
})

afterEach(() => {
  liveSnapshot.update({ snapshot: undefined })
  vi.unstubAllGlobals()
})

describe('the sheet beside the map', () => {
  it('holds City pulse, the Vehicles list and Disruptions as tabs, City pulse open', () => {
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('en')
    expect(sheet()).toHaveAccessibleName('Overview')
    const list = tabs('Overview')
    expect(
      within(list)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['City pulse', 'Vehicles 18', 'Disruptions'])
    expect(within(list).getByRole('tab', { name: 'City pulse' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(within(sheet()).getByRole('tabpanel')).toHaveAccessibleName('City pulse')
  })

  it('names its tabs in Danish', () => {
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('da')
    expect(sheet()).toHaveAccessibleName('Overblik')
    expect(
      within(tabs('Overblik'))
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Byens puls', 'Køretøjer 18', 'Driftsforstyrrelser'])
  })

  it('keeps the open tab in the address, so a reload or the language switch keeps it', () => {
    renderScreen('en')
    fireEvent.click(within(tabs('Overview')).getByRole('tab', { name: /^Vehicles/ }))
    expect(window.location.search).toBe('?tab=vehicles')
    fireEvent.click(within(tabs('Overview')).getByRole('tab', { name: 'City pulse' }))
    expect(window.location.search).toBe('')
  })

  it('opens the tab the address names, in Danish', () => {
    window.history.replaceState(null, '', '/da?tab=disruptions&hide=bus')
    renderScreen('da')
    expect(
      within(tabs('Overblik')).getByRole('tab', { name: 'Driftsforstyrrelser' }),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('sits on the left on a desktop and at the bottom on a phone', () => {
    widthOf(false)
    const { unmount } = renderScreen('en')
    expect(sheet()).toHaveAttribute('data-anchor', 'left')
    unmount()
    widthOf(true)
    renderScreen('en')
    expect(sheet()).toHaveAttribute('data-anchor', 'bottom')
  })

  it('can be closed and opened again', () => {
    renderScreen('en')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
    expect(sheet()).toBeInTheDocument()
  })
})

describe("City pulse's first figure", () => {
  // The sixth minute: 6 buses underway and a seventh waiting at its first stop, 4 Metro trains,
  // 6 S-trains and 1 regional train, so 17 on the move of the 18 in service.
  it('counts the trips on the move of those in service', () => {
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('en')
    const pulse = within(sheet()).getByRole('tabpanel', { name: 'City pulse' })
    const figure = within(pulse).getByRole('group', { name: 'On the move' })
    expect(figure).toHaveTextContent('17')
    expect(figure).toHaveTextContent('of 18 in service')
  })

  it('says it in Danish', () => {
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('da')
    const figure = within(sheet()).getByRole('group', { name: 'I bevægelse' })
    expect(figure).toHaveTextContent('17')
    expect(figure).toHaveTextContent('af 18 i drift')
  })

  it('follows the mode filters, with the whole kept in view', () => {
    act(() => liveSnapshot.update({ snapshot: saved('0006.json') }))
    renderScreen('en')
    const modes = screen.getByRole('banner')
    const figure = () => within(sheet()).getByRole('group', { name: 'On the move' })
    // The timetable hasn't loaded, so the chips are not drawn: the address filters instead.
    expect(modes).toBeInTheDocument()
    act(() => {
      window.history.replaceState(null, '', '/en?hide=bus')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    // The 6 buses underway leave the figure; the whole stays the city's.
    expect(figure()).toHaveTextContent('11')
    expect(figure()).toHaveTextContent('of 18 in service')
    expect(within(tabs('Overview')).getByRole('tab', { name: /^Vehicles/ })).toHaveTextContent(
      'Vehicles 11',
    )
  })

  it('shows "—" before the first snapshot lands', () => {
    renderScreen('en')
    const figure = within(sheet()).getByRole('group', { name: 'On the move' })
    expect(figure).toHaveTextContent('—')
    expect(figure).not.toHaveTextContent('in service')
  })

  it('groups thousands with a space, as the screens write numbers', async () => {
    const { grouped } = await import('./numbers')
    expect(grouped(1046)).toBe('1 046')
    expect(grouped(312)).toBe('312')
  })
})
