import '@mylder/perron/tokens.css'
import { act, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveSnapshot } from '../map/live'
import { timetableRoutes } from '../test/timetableRoutes'
import type { Snapshot } from '../tracker/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

/** A saved snapshot of the weekday recording, landed as the poll brings it. */
const land = (name: string, change: Partial<Snapshot> = {}) => {
  const snapshot = {
    ...(JSON.parse(
      readFileSync(join(process.cwd(), 'recordings', 'weekday', 'snapshots', name), 'utf8'),
    ) as Snapshot),
    ...change,
  }
  act(() => liveSnapshot.update({ snapshot, clockOffset: snapshot.fetched + 20_000 - Date.now() }))
}

const renderScreen = (lang: Lang) =>
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )

const pulse = () => within(screen.getByRole('dialog')).getByRole('tabpanel')

beforeEach(() => {
  window.history.replaceState(null, '', '/en')
  vi.stubGlobal('fetch', timetableRoutes)
})

afterEach(() => {
  liveSnapshot.update({ snapshot: undefined, clockOffset: 0 })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// The weekday recording's Tuesday, 16 June, from the fixture timetable's day profiles: its few
// trips run in the small hours and the morning, 14 underway from 07:30 to 08:00.
describe("City pulse's day profile", () => {
  it("draws today's planned trips by quarter hour, labelled planned, with its peak", async () => {
    land('0006.json')
    renderScreen('en')
    const plot = await within(pulse()).findByRole('group', {
      name: "Vehicles in service today Planned, from today's timetable",
    })
    expect(plot).toHaveAccessibleDescription('Peak 14 at 07:30')
    const points = within(plot).getAllByRole('listitem')
    expect(points).toHaveLength(96)
    expect(points[0]).toHaveTextContent('00:00 0')
    expect(points[30]).toHaveTextContent('07:30 14')
    expect(points[95]).toHaveTextContent('23:45 0')
  })

  it('says it in Danish', async () => {
    land('0006.json')
    renderScreen('da')
    const plot = await within(pulse()).findByRole('group', {
      name: 'Køretøjer i drift i dag Planlagt, ud fra dagens køreplan',
    })
    expect(plot).toHaveAccessibleDescription('Højest 14 kl. 07:30')
  })

  it('shows the error state in its place when the timetable has no profile for the day', async () => {
    land('0006.json', { serviceDay: '2026-09-01' })
    renderScreen('en')
    expect(await within(pulse()).findByText("Could not load today's timetable")).toBeInTheDocument()
    expect(
      within(pulse()).queryByRole('group', { name: /^Vehicles in service today/ }),
    ).not.toBeInTheDocument()
  })

  it('shows the error state in Danish when the day profiles will not load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // A version the server doesn't hold, so its files answer 404.
    land('0006.json', { timetableVersion: '2026-10-25-6495dcc6' })
    renderScreen('da')
    expect(await within(pulse()).findByText('Kunne ikke hente dagens køreplan')).toBeInTheDocument()
  })

  it('says it is loading while the day profiles are on their way', () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    // A version no other test has loaded, which the page's loader would otherwise keep.
    land('0006.json', { timetableVersion: '2026-10-26-00c0ffee' })
    renderScreen('en')
    expect(within(pulse()).getByText('Loading')).toBeInTheDocument()
  })
})
