import { act, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '../i18n/en.json'
import { disruptionListStore } from '../map/disruptions'
import { liveSnapshot } from '../map/live'
import { noticesAt } from '../map/notices'
import type { Snapshot } from '../tracker/index'
import { aboutDialog } from './about'
import { AboutDialog } from './AboutDialog'
import { DisruptionList } from './DisruptionList'
import { MapLegend } from './MapLegend'
import { Providers } from './Providers'

// What each screen says of the page's source, on every saved snapshot the screens are tested
// with and on a simulated and a live one: the source banner, the legend's note, the About
// dialog's source, note, credit, realtime and messages, and the Disruptions tab. The words are
// the dictionary's, as the screens read on main before the sources were described in one place
// (src/domain/source.ts), so a source's description that changes what a rider reads fails here.

const saved = (recording: string): Snapshot => {
  const folder = join(process.cwd(), 'recordings', recording, 'snapshots')
  const last = ['0006.json', '0003.json', '0001.json'].find((name) => {
    try {
      readFileSync(join(folder, name))
      return true
    } catch {
      return false
    }
  })
  return JSON.parse(readFileSync(join(folder, last!), 'utf8')) as Snapshot
}

const weekday = saved('weekday')

const NOT_CONNECTED = 'Not connected yet'
const NOT_REAL = 'The vehicles on this page are not real.'
const REALTIME_CREDIT = 'Realtime data and the timetable: Rejseplanen, under CC BY 4.0.'
const TIMETABLE_CREDIT = 'Timetable data: Rejseplanen, under CC BY 4.0.'

interface Reads {
  /** The source banner's notice, without its moment. */
  readonly banner: 'simulated' | 'timetable' | 'recording' | undefined
  readonly legendNote: boolean
  readonly source: string
  readonly note: string | undefined
  readonly credit: string
  /** Whether About's realtime and messages say they aren't connected yet. */
  readonly connected: boolean
  /** Whether Disruptions says the messages come with the live connection, in their place. */
  readonly noMessages: boolean
}

const RECORDED = (name: string): Reads => ({
  banner: 'recording',
  legendNote: false,
  source: `A recording, ${name}`,
  note: NOT_REAL,
  credit: REALTIME_CREDIT,
  connected: true,
  noMessages: false,
})

const ON_TIMETABLE: Reads = {
  banner: 'timetable',
  legendNote: true,
  source: "Rejseplanen's timetable, no live positions yet",
  note: "The positions on this page are the timetable's plan, not reports from the vehicles.",
  credit: TIMETABLE_CREDIT,
  connected: false,
  noMessages: true,
}

const CASES: [string, Snapshot, Reads][] = [
  ['weekday', weekday, RECORDED('weekday')],
  ['spent', saved('spent'), RECORDED('spent')],
  ['refused-key', saved('refused-key'), RECORDED('refused-key')],
  ['timetable-source', saved('timetable-source'), ON_TIMETABLE],
  ['timetable-ending', saved('timetable-ending'), ON_TIMETABLE],
  [
    'simulated',
    { ...weekday, source: { kind: 'simulated', name: 'weekday' } },
    {
      ...RECORDED('weekday'),
      banner: 'simulated',
      source: 'Simulated vehicles, scenario weekday',
    },
  ],
  [
    'rejseplanen',
    { ...weekday, source: { kind: 'rejseplanen' } },
    { ...RECORDED('weekday'), banner: undefined, source: 'Rejseplanen', note: undefined },
  ],
]

/** A fact of About's status list, by its name. */
const fact = (dialog: HTMLElement, name: string) =>
  within(dialog).getByText(name, { selector: 'dt' }).nextElementSibling?.textContent

// The timetable never loads here, so times read on Copenhagen's clock, every timetable's.
beforeEach(() => {
  vi.stubGlobal('fetch', () => new Promise(() => {}))
})

afterEach(() => {
  act(() => aboutDialog.close())
  liveSnapshot.update({ snapshot: undefined })
  vi.unstubAllGlobals()
})

describe('what the screens say of the source', () => {
  it.each(CASES)('on %s', (_, snapshot, reads) => {
    const banner = noticesAt({ snapshot }, snapshot.fetched).find(
      (notice) => notice.kind === 'source',
    )
    expect(banner?.source).toBe(reads.banner)

    liveSnapshot.update({ snapshot, clockOffset: 0 })
    // A list that never lands, so the tab shows what it shows before one.
    const store = disruptionListStore(() => new Promise(() => {}))
    render(
      <Providers lang="en" dictionary={en}>
        <MapLegend />
        <AboutDialog />
        <DisruptionList store={store} />
      </Providers>,
    )
    const legendNote = screen.queryAllByText(en.onTimetable.legend)
    expect(legendNote.length > 0).toBe(reads.legendNote)
    expect(screen.queryByText(en.timetableOverview.disruptions) !== null).toBe(reads.noMessages)

    act(() => aboutDialog.open())
    const dialog = screen.getByRole('dialog', { name: 'About Mylder' })
    expect(fact(dialog, 'Source')).toBe(reads.source)
    for (const note of [NOT_REAL, ON_TIMETABLE.note!]) {
      expect(within(dialog).queryByText(note) !== null).toBe(note === reads.note)
    }
    expect(dialog).toHaveTextContent(reads.credit)
    expect(fact(dialog, "Rejseplanen's realtime") === NOT_CONNECTED).toBe(!reads.connected)
    expect(fact(dialog, 'Disruptions') === NOT_CONNECTED).toBe(!reads.connected)
  })
})
