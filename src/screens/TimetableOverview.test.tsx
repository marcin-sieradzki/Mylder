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

// The Overview on the timetable source (docs/screens.md, "City pulse", "The Vehicles list" and
// "Disruptions"): the tracker's run with no calls, saved in recordings/timetable-source, its last
// minute, built at 07:25:00 in Copenhagen. Its 18 trips are all Timetable only: 7 buses, one of
// them Waiting at its first stop, 6 S-trains, 4 Metro trains and 1 regional train, on the weekday
// recording's timetable. Nothing in the Overview names Rejseplanen's positions or its messages.
const folder = join(process.cwd(), 'recordings', 'timetable-source')
const read = (path: string): unknown => JSON.parse(readFileSync(join(folder, path), 'utf8'))
const minute6 = read('snapshots/0006.json') as Snapshot

/** The disruption route's answer saved then, which holds no message, and the timetable's routes. */
const routes = async (input: RequestInfo | URL): Promise<Response> =>
  String(input).startsWith('/api/disruptions')
    ? Response.json(read('answers/disruptions/0006.json'))
    : timetableRoutes(input)

/** Opens the page in `lang` on the tab `tab` names, `after` ms after the snapshot was built. */
function open(lang: Lang, tab: string, snapshot: Snapshot = minute6, after = 20_000) {
  act(() => liveSnapshot.update({ snapshot, clockOffset: snapshot.fetched + after - Date.now() }))
  window.history.replaceState(null, '', `/${lang}${tab ? `?tab=${tab}` : ''}`)
  return render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )
}

const panel = () => within(screen.getByRole('dialog')).getByRole('tabpanel')
const figure = (name: string) => within(panel()).getByRole('group', { name })
const meter = (name: string) => within(panel()).getByRole('meter', { name })
/** A meter's line, under it. */
const meterLine = (name: string) => meter(name).parentElement!.parentElement!.textContent

/** A count of the by-mode list, by its mode's name. */
const countOf = (list: HTMLElement, mode: string) =>
  within(list).getByText(mode, { selector: 'dt' }).nextElementSibling?.textContent

beforeEach(() => {
  // jsdom has no server: the routes answer from the recording's files.
  vi.stubGlobal('fetch', routes)
})

afterEach(() => {
  liveSnapshot.update({ snapshot: undefined, clockOffset: 0 })
  vi.unstubAllGlobals()
})

describe('City pulse on the timetable source', () => {
  const NO_LIVE = 'No live positions yet; placed from the timetable'

  it('counts the vehicles on the map, and by mode', () => {
    open('en', '')
    expect(figure('On the move')).toHaveTextContent(/^On the move17of 18 in service$/)
    const byMode = within(panel()).getByRole('region', { name: 'On the map, by mode' })
    expect(countOf(byMode, 'Bus')).toBe('7')
    expect(countOf(byMode, 'Metro')).toBe('4')
    expect(countOf(byMode, 'S-tog')).toBe('6')
    expect(countOf(byMode, 'Train')).toBe('1')
  })

  it('reads "—" where a figure needs live positions, and says none are connected yet', () => {
    open('en', '')
    expect(figure('Reported this minute')).toHaveTextContent(
      new RegExp(`^Reported this minute—Unknown\\s*${NO_LIVE}$`),
    )
    expect(figure('Reporting live')).toHaveTextContent(
      new RegExp(`^Reporting live—Unknown\\s*${NO_LIVE}$`),
    )
    for (const mode of ['Bus', 'S-tog', 'Train']) {
      expect(meter(mode)).toHaveAttribute('aria-valuetext', 'Unknown')
      expect(meter(mode)).toHaveAttribute('data-color', 'neutral')
      expect(meterLine(mode)).toContain(NO_LIVE)
    }
    // The Metro is an interval line on every source, and says so.
    expect(meterLine('Metro')).toContain('No realtime from the Metro; placed from the timetable')
    expect(panel()).not.toHaveTextContent('paused')
  })

  it('leaves out the average delay', () => {
    // Even were a delay carried, as no run on this source can carry one.
    const delayed = minute6.trips.map((trip) => ({ ...trip, delay: 60 }))
    open('en', '', {
      ...minute6,
      trips: [...delayed, ...delayed.map((t) => ({ ...t, key: `${t.key}+1` }))],
    })
    expect(within(panel()).queryByRole('group', { name: 'Average delay' })).not.toBeInTheDocument()
  })

  it('says every vehicle is Timetable only, as no live position is connected yet', () => {
    open('en', '')
    const key = within(panel()).getByRole('list', { name: 'How sure are we?' })
    expect(
      within(key)
        .getAllByRole('listitem')
        .find((item) => item.textContent?.startsWith('Timetable only')),
    ).toHaveTextContent('Timetable only 18 No live positions yet; placed from the timetable.')
    expect(key).not.toHaveTextContent('No realtime for this trip today')
  })

  it('names the timetable as its source, with the moment it placed the vehicles', () => {
    open('en', '')
    expect(within(panel()).getByText('Timetable').closest('p')).toHaveTextContent(
      /^Timetable · placed 07:25:00$/,
    )
    expect(panel()).not.toHaveTextContent('Rejseplanen ·')
  })

  it("keeps today's planned trips by quarter hour", async () => {
    open('en', '')
    const plot = await within(panel()).findByRole('group', {
      name: "Vehicles in service today Planned, from today's timetable",
    })
    expect(plot).toHaveAccessibleDescription('Peak 14 at 07:30')
  })

  it('says it all in Danish', async () => {
    const NO_LIVE_DA = 'Ingen livepositioner endnu; placeret efter køreplanen'
    open('da', '')
    expect(figure('I bevægelse')).toHaveTextContent(/^I bevægelse17af 18 i drift$/)
    const byMode = within(panel()).getByRole('region', { name: 'På kortet, efter transportform' })
    expect(countOf(byMode, 'Bus')).toBe('7')
    expect(countOf(byMode, 'Tog')).toBe('1')
    expect(figure('Meldt i dette minut')).toHaveTextContent(NO_LIVE_DA)
    expect(figure('Melder live')).toHaveTextContent(NO_LIVE_DA)
    expect(meterLine('Bus')).toContain(NO_LIVE_DA)
    expect(within(panel()).getByRole('list', { name: 'Hvor sikre er vi?' })).toHaveTextContent(
      `Kun køreplan 18 ${NO_LIVE_DA}.`,
    )
    expect(within(panel()).getByText('Køreplan').closest('p')).toHaveTextContent(
      /^Køreplan · placeret 07:25:00$/,
    )
    expect(
      await within(panel()).findByRole('group', {
        name: 'Køretøjer i drift i dag Planlagt, ud fra dagens køreplan',
      }),
    ).toHaveAccessibleDescription('Højest 14 kl. 07:30')
  })

  it('reads as before on any other source', () => {
    open('en', '', { ...minute6, source: { kind: 'simulated', name: 'weekday' } })
    expect(
      within(panel()).queryByRole('region', { name: 'On the map, by mode' }),
    ).not.toBeInTheDocument()
    expect(panel()).not.toHaveTextContent('No live positions yet')
    expect(panel()).not.toHaveTextContent('placed 07:25:00')
    // Position mode none with no timetable source: positions are paused from the start.
    expect(figure('Reported this minute')).toHaveTextContent('Positions are paused')
  })
})

describe('the Vehicles list on the timetable source', () => {
  it('lists every vehicle on the map with its line, destination and Timetable only', () => {
    open('en', 'vehicles')
    const table = within(panel()).getByRole('table', { name: 'Vehicles' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(18)
    for (const row of rows) expect(row).toHaveTextContent('Timetable only')
    // Line, destination and state: the 5C to Husum Torv, underway on its planned times.
    expect(rows.map((row) => row.textContent)).toContain('5CHusum TorvTimetable only')
    // No delay is carried, so the column is left out rather than filled with "—".
    expect(within(table).queryByRole('columnheader', { name: 'Delay' })).not.toBeInTheDocument()
    expect(within(panel()).getByText('Timetable').closest('p')).toHaveTextContent(
      /^Timetable · placed 07:25:00$/,
    )
    expect(panel()).not.toHaveTextContent('Rejseplanen')
  })

  it('says it in Danish', () => {
    open('da', 'vehicles')
    const table = within(panel()).getByRole('table', { name: 'Køretøjer' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(18)
    for (const row of rows) expect(row).toHaveTextContent('Kun køreplan')
    expect(within(panel()).getByText('Køreplan').closest('p')).toHaveTextContent(
      /^Køreplan · placeret 07:25:00$/,
    )
  })
})

describe('Disruptions on the timetable source', () => {
  const SENTENCE_EN =
    "Disruption messages come with Rejseplanen's live connection, which isn't connected yet."
  const SENTENCE_DA =
    'Driftsmeddelelser kommer med Rejseplanens liveforbindelse, som ikke er koblet på endnu.'

  it('says the messages come with the live connection, in place of the list and its checks', async () => {
    open('en', 'disruptions')
    await act(async () => {})
    expect(panel()).toHaveTextContent(new RegExp(`^${SENTENCE_EN}$`))
    expect(within(panel()).queryByRole('list')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('tablist', { name: 'Overview' })).getByRole('tab', {
        name: 'Disruptions',
      }),
    ).toHaveTextContent(/^Disruptions$/)
  })

  it('shows no data card, however long after the snapshot was built', async () => {
    // Hours on, with the month spent and the API failing, as no run on this source can make it.
    const odd: Snapshot = {
      ...minute6,
      api: { status: 'error', since: minute6.fetched - 60 * 60_000 },
      budget: { level: 'spent', calls: 0, resumes: '2026-07-01' },
      lastSeen: { bus: minute6.fetched - 3 * 60 * 60_000 },
    }
    open('en', 'disruptions', odd, 3 * 60 * 60_000)
    await act(async () => {})
    expect(panel()).toHaveTextContent(new RegExp(`^${SENTENCE_EN}$`))
    for (const words of [
      'From Mylder',
      'No answer from Rejseplanen',
      'No bus positions since',
      'Disruption messages not fetched yet',
      'Live data paused',
    ]) {
      expect(panel()).not.toHaveTextContent(words)
    }
  })

  it('says it in Danish', async () => {
    open('da', 'disruptions')
    await act(async () => {})
    expect(panel()).toHaveTextContent(new RegExp(`^${SENTENCE_DA}$`))
  })
})
