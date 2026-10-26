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
import { Providers } from './Providers'
import { VehicleList } from './VehicleList'

/** A saved snapshot of the weekday recording. */
const saved = (name: string): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', 'weekday', 'snapshots', name), 'utf8'),
  ) as Snapshot

// The sixth minute: 18 trips on the map, 7 buses, 4 Metro trains, 6 S-trains and 1 regional
// train, 13 of them with a delay.
const MINUTE_6 = '0006.json'

/** Lands `snapshot` with the server's clock 20 s past its fetch, as when the poll has just brought it. */
const land = (snapshot: Snapshot) =>
  act(() => liveSnapshot.update({ snapshot, clockOffset: snapshot.fetched + 20_000 - Date.now() }))

const renderList = (lang: Lang) =>
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <VehicleList />
    </Providers>,
  )

/** The table's rows, the header row left out, each as its text. */
const rows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent)

/** The destinations in the table, in its order. */
const destinations = () =>
  within(screen.getByRole('table'))
    .getAllByRole('link')
    .map((link) => link.textContent)

const search = (lang: Lang, words: string) =>
  fireEvent.change(
    screen.getByRole('combobox', {
      name: lang === 'da' ? 'Søg i linjer og destinationer' : 'Search lines and destinations',
    }),
    { target: { value: words } },
  )

beforeEach(() => {
  window.history.replaceState(null, '', '/en')
  // jsdom has no server: the timetable stays on its way.
  vi.stubGlobal('fetch', () => new Promise(() => {}))
})

afterEach(() => {
  liveSnapshot.update({ snapshot: undefined, clockOffset: 0 })
  vi.unstubAllGlobals()
})

describe('the Vehicles list', () => {
  it('shows every trip on the map as a row, sorted by line', () => {
    land(saved(MINUTE_6))
    renderList('en')
    expect(screen.getByRole('table')).toHaveAccessibleName('Vehicles')
    expect(rows()).toHaveLength(18)
    // Metro, S-tog, Train, Bus, then the line names in numeric order: 5C before 991.
    // Two trips of one line keep the order of their keys.
    expect(destinations().slice(0, 4)).toEqual([
      'Vestamager St. (Metro)',
      'Vestamager St. (Metro)',
      'Vanløse St. (Metro)',
      'Vanløse St. (Metro)',
    ])
    expect(destinations().slice(-2)).toEqual(['Teglholmen', 'Teglholmen'])
    expect(screen.getByRole('columnheader', { name: 'Line' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
  })

  it('follows the mode filters', () => {
    window.history.replaceState(null, '', '/en?hide=bus')
    land(saved(MINUTE_6))
    renderList('en')
    expect(rows()).toHaveLength(11)
  })

  it('names where its positions come from and when', () => {
    land(saved(MINUTE_6))
    renderList('en')
    expect(screen.getByText('Rejseplanen').closest('p')).toHaveTextContent(
      /^Rejseplanen · positions \d\d:\d\d:\d\d$/,
    )
  })

  it('waits for the first snapshot', () => {
    renderList('en')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Loading')).toBeInTheDocument()
  })
})

describe('searching', () => {
  it('narrows the rows by line', () => {
    land(saved(MINUTE_6))
    renderList('en')
    search('en', '5c')
    expect(rows()).toHaveLength(5)
    expect(rows().every((row) => row?.startsWith('5C'))).toBe(true)
  })

  it('narrows the rows by destination, ignoring case and accents', () => {
    land(saved(MINUTE_6))
    renderList('en')
    search('en', 'koge')
    expect(destinations()).toEqual(['Køge St.'])
  })

  it('says so when no vehicle matches', () => {
    land(saved(MINUTE_6))
    renderList('en')
    search('en', 'Roskilde')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('No vehicles match.')).toBeInTheDocument()
  })

  it('says it in Danish', () => {
    land(saved(MINUTE_6))
    renderList('da')
    search('da', 'hillerød')
    expect(destinations()).toEqual(['Hillerød St.', 'Hillerød St.'])
    search('da', 'Roskilde')
    expect(screen.getByText('Ingen køretøjer matcher.')).toBeInTheDocument()
  })
})

describe('sorting', () => {
  it('sorts by delay, unknown delays last, and keeps its order across an unchanged snapshot', () => {
    const snapshot = saved(MINUTE_6)
    land(snapshot)
    renderList('en')
    fireEvent.click(screen.getByRole('button', { name: 'Delay' }))
    expect(screen.getByRole('columnheader', { name: 'Delay' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    // A minute early, then on time; the Metro and the Waiting bus, with no delay, last.
    expect(destinations().slice(0, 2)).toEqual(['Sundbyvester Plads', 'Husum Torv'])
    expect(destinations().slice(-5)).toEqual([
      'Teglholmen',
      'Vestamager St. (Metro)',
      'Vestamager St. (Metro)',
      'Vanløse St. (Metro)',
      'Vanløse St. (Metro)',
    ])
    const before = rows()
    // The same answer again, its trips in another order: no row moves.
    land({ ...snapshot, trips: [...snapshot.trips].reverse() })
    expect(rows()).toEqual(before)

    fireEvent.click(screen.getByRole('button', { name: 'Delay' }))
    expect(screen.getByRole('columnheader', { name: 'Delay' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    // The four three minutes late first, by key; the unknown delays stay last.
    expect(destinations().slice(0, 4)).toEqual([
      'Sundbyvester Plads',
      'Hillerød St.',
      'Hundige St.',
      'Hundige St.',
    ])
    expect(destinations().at(-1)).toBe('Vanløse St. (Metro)')
  })

  it('sorts by position, freshest state first', () => {
    land(saved(MINUTE_6))
    renderList('en')
    fireEvent.click(screen.getByRole('button', { name: 'Position' }))
    expect(rows()[0]).toContain('Live')
    expect(rows().at(-1)).toContain('Timetable only')
  })

  it('names its headers in Danish', () => {
    land(saved(MINUTE_6))
    renderList('da')
    expect(
      within(screen.getByRole('table'))
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Linje', 'Destination', 'Position', 'Forsinkelse'])
  })
})

describe('the Delay column', () => {
  it('is absent when no trip carries a delay', () => {
    const snapshot = saved(MINUTE_6)
    land({ ...snapshot, trips: snapshot.trips.map((trip) => ({ ...trip, delay: undefined })) })
    renderList('en')
    expect(screen.queryByRole('columnheader', { name: 'Delay' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
  })
})

describe('a row', () => {
  it("opens the vehicle's detail in the address, the rest of the view kept", () => {
    window.history.replaceState(null, '', '/en?tab=vehicles&hide=bus')
    land(saved(MINUTE_6))
    renderList('en')
    const link = screen.getByRole('link', { name: 'Næstved St.' })
    expect(link).toHaveAttribute(
      'href',
      '?tab=vehicles&hide=bus&trip=train.RE.7c3e865b99.20260616.0717',
    )
    fireEvent.click(link)
    expect(new URLSearchParams(window.location.search).get('trip')).toBe(
      'train.RE.7c3e865b99.20260616.0717',
    )
    expect(window.location.pathname).toBe('/en')
  })
})
