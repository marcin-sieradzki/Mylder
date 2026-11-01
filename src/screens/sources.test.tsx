import { act, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { disruptionListStore } from '../map/disruptions'
import { liveSnapshot } from '../map/live'
import type { Snapshot } from '../tracker/index'
import { aboutDialog } from './about'
import { AboutDialog } from './AboutDialog'
import { DisruptionList } from './DisruptionList'
import { MapLegend } from './MapLegend'
import { PageNotices } from './PageNotices'
import { Providers } from './Providers'

// What each screen says of the page's source, in English and Danish, on every saved snapshot the
// screens are tested with and on a simulated and a live one: the source banner, the legend's note,
// the About dialog's source, note, credit, realtime and messages, and the Disruptions tab's
// sentence in place of the messages.

const saved = (recording: string, name: string): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', recording, 'snapshots', name), 'utf8'),
  ) as Snapshot

const weekday = saved('weekday', '0006.json')

/** The words that don't change from source to source, in each language. */
const WORDS = {
  en: {
    about: 'About Mylder',
    source: 'Source',
    realtime: "Rejseplanen's realtime",
    disruptions: 'Disruptions',
    notConnected: 'Not connected yet',
    legendNote: "Every vehicle is Timetable only for now: live positions aren't connected yet.",
    noMessages:
      "Disruption messages come with Rejseplanen's live connection, which isn't connected yet.",
  },
  da: {
    about: 'Om Mylder',
    source: 'Kilde',
    realtime: 'Rejseplanens realtid',
    disruptions: 'Driftsforstyrrelser',
    notConnected: 'Ikke koblet på endnu',
    legendNote: 'Alle køretøjer er Kun køreplan indtil videre: der er endnu ingen livepositioner.',
    noMessages:
      'Driftsmeddelelser kommer med Rejseplanens liveforbindelse, som ikke er koblet på endnu.',
  },
} satisfies Record<Lang, unknown>

/** What a rider reads of one source, in one language. */
interface Reads {
  readonly banner: string | undefined
  readonly legendNote: boolean
  readonly source: string
  readonly note: string | undefined
  readonly credit: string
  /** Whether About's realtime and messages are connected, rather than "not connected yet". */
  readonly connected: boolean
  /** Whether Disruptions says the messages come with the live connection, in their place. */
  readonly noMessages: boolean
}

const recorded = (name: string): Record<Lang, Reads> => ({
  en: {
    banner: 'Recorded data from 16 June 2026.',
    legendNote: false,
    source: `A recording, ${name}`,
    note: 'The vehicles on this page are not real.',
    credit: 'Realtime data and the timetable: Rejseplanen, under CC BY 4.0.',
    connected: true,
    noMessages: false,
  },
  da: {
    banner: 'Optagne data fra 16. juni 2026.',
    legendNote: false,
    source: `En optagelse, ${name}`,
    note: 'Køretøjerne på denne side er ikke rigtige.',
    credit: 'Realtidsdata og køreplan: Rejseplanen, under CC BY 4.0.',
    connected: true,
    noMessages: false,
  },
})

const ON_TIMETABLE: Record<Lang, Reads> = {
  en: {
    banner: undefined,
    legendNote: true,
    source: "Rejseplanen's timetable, no live positions yet",
    note: "The positions on this page are the timetable's plan, not reports from the vehicles.",
    credit: 'Timetable data: Rejseplanen, under CC BY 4.0.',
    connected: false,
    noMessages: true,
  },
  da: {
    banner: undefined,
    legendNote: true,
    source: 'Rejseplanens køreplan, endnu ingen livepositioner',
    note: 'Positionerne på denne side er køreplanens plan, ikke meldinger fra køretøjerne.',
    credit: 'Køreplansdata: Rejseplanen, under CC BY 4.0.',
    connected: false,
    noMessages: true,
  },
}

const SIMULATED: Record<Lang, Reads> = {
  en: {
    ...recorded('weekday').en,
    banner: 'Simulated data: vehicles and times are made up from the timetable.',
    source: 'Simulated vehicles, scenario weekday',
  },
  da: {
    ...recorded('weekday').da,
    banner: 'Simulerede data: køretøjer og tider er digtet op ud fra køreplanen.',
    source: 'Simulerede køretøjer, scenarie weekday',
  },
}

const LIVE: Record<Lang, Reads> = {
  en: { ...recorded('weekday').en, banner: undefined, source: 'Rejseplanen', note: undefined },
  da: { ...recorded('weekday').da, banner: undefined, source: 'Rejseplanen', note: undefined },
}

const CASES: [string, Snapshot, Record<Lang, Reads>][] = [
  ['weekday', weekday, recorded('weekday')],
  ['spent', saved('spent', '0003.json'), recorded('spent')],
  ['refused-key', saved('refused-key', '0003.json'), recorded('refused-key')],
  ['timetable-source', saved('timetable-source', '0006.json'), ON_TIMETABLE],
  ['timetable-ending', saved('timetable-ending', '0001.json'), ON_TIMETABLE],
  ['simulated', { ...weekday, source: { kind: 'simulated', name: 'weekday' } }, SIMULATED],
  ['rejseplanen', { ...weekday, source: { kind: 'rejseplanen' } }, LIVE],
]

/** Every banner and note a source can show, in one language. */
const everyOf = (lang: Lang, field: 'banner' | 'note') =>
  [recorded('weekday'), ON_TIMETABLE, SIMULATED].map((reads) => reads[lang][field]!)

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
  it.each(
    CASES.flatMap(([name, snapshot, reads]) => [
      [name, 'en', snapshot, reads.en] as const,
      [name, 'da', snapshot, reads.da] as const,
    ]),
  )('on %s, in %s', (_, lang, snapshot, reads) => {
    const words = WORDS[lang]
    liveSnapshot.update({ snapshot, clockOffset: 0 })
    // A list that never lands, so the tab shows what it shows before one.
    const store = disruptionListStore(() => new Promise(() => {}))
    render(
      <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
        <PageNotices />
        <MapLegend />
        <AboutDialog />
        <DisruptionList store={store} />
      </Providers>,
    )
    const banners = screen
      .queryAllByRole('status')
      .map((status) => status.textContent)
      .filter((text) => everyOf(lang, 'banner').includes(text ?? ''))
    expect(banners).toEqual(reads.banner === undefined ? [] : [reads.banner])
    expect(screen.queryAllByText(words.legendNote).length > 0).toBe(reads.legendNote)
    expect(screen.queryByText(words.noMessages) !== null).toBe(reads.noMessages)

    act(() => aboutDialog.open())
    const dialog = screen.getByRole('dialog', { name: words.about })
    expect(fact(dialog, words.source)).toBe(reads.source)
    for (const note of everyOf(lang, 'note')) {
      expect(within(dialog).queryByText(note) !== null).toBe(note === reads.note)
    }
    expect(dialog).toHaveTextContent(reads.credit)
    expect(fact(dialog, words.realtime) === words.notConnected).toBe(!reads.connected)
    expect(fact(dialog, words.disruptions) === words.notConnected).toBe(!reads.connected)
  })
})
