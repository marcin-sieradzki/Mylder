import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveSnapshot } from '../map/live'
import type { Snapshot } from '../tracker/index'
import { aboutDialog } from './about'
import { AboutDialog } from './AboutDialog'
import { MapCredit } from './MapCredit'
import { Providers } from './Providers'

const saved = (recording: string, name: string): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', recording, 'snapshots', name), 'utf8'),
  ) as Snapshot

// 07:25 on the weekday recording, its timetable prepared on 2 June; and a month spent.
const weekday = saved('weekday', '0006.json')
const spent = saved('spent', '0003.json')

function show(lang: Lang, snapshot?: Snapshot) {
  liveSnapshot.update({ snapshot, clockOffset: 0 })
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapCredit />
      <AboutDialog />
    </Providers>,
  )
}

/** The keys the dialog names, as their Kbd elements read. */
const keysIn = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByText((_, element) => element?.tagName === 'KBD')
    .map((key) => key.textContent)

const STATE_KEYS = ['live', 'ageing', 'estimated', 'timetableOnly', 'noSignal'] as const

const openDialog = (name: string) => {
  act(() => aboutDialog.open())
  return screen.getByRole('dialog', { name })
}

/** A fact of the status list, by its name. */
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

describe('the About dialog', () => {
  it('gives the terms, the states, the page’s status and the keys, in English', () => {
    show('en', weekday)
    const dialog = openDialog('About Mylder')
    expect(dialog).toHaveTextContent(
      'Realtime data and the timetable: Rejseplanen, under CC BY 4.0. Timetable of 2 June.',
    )
    expect(dialog).toHaveTextContent(
      'Map: © OpenStreetMap contributors under the ODbL, © OpenMapTiles, OpenFreeMap.',
    )
    expect(dialog).toHaveTextContent('no advertising, no paid tier')
    expect(within(dialog).getByRole('link', { name: 'ODbL' })).toHaveAttribute(
      'href',
      'https://opendatacommons.org/licenses/odbl/',
    )
    for (const sentence of STATE_KEYS.map((key) => en.about.states[key])) {
      expect(dialog).toHaveTextContent(sentence)
    }
    expect(fact(dialog, 'Source')).toBe('A recording, weekday')
    expect(dialog).toHaveTextContent('The vehicles on this page are not real.')
    expect(fact(dialog, 'Positions')).toBe('Reports and computed positions, by turns')
    expect(fact(dialog, "Rejseplanen's realtime")).toBe('07:25:00')
    expect(fact(dialog, 'Poll')).toBe('Every 60 s')
    expect(within(dialog).getByRole('link', { name: 'its licence' })).toHaveAttribute(
      'href',
      'https://github.com/marcin-sieradzki/mylder/blob/main/src/map/style/LICENSE.md',
    )
    expect(fact(dialog, 'Data budget')).toBe('Normal')
    expect(fact(dialog, 'Calls this month')).toBe('7')
    expect(fact(dialog, 'Disruptions')).toBe('Checked 07:20')
    expect(keysIn(dialog)).toEqual(['+', '−', '←', '→', '↑', '↓', 'Esc'])
    expect(dialog).toHaveTextContent(
      'The pause button, beside the zoom buttons, stops the vehicles moving, and the play button starts them again.',
    )
  })

  it('gives them in Danish', () => {
    show('da', weekday)
    const dialog = openDialog('Om Mylder')
    expect(dialog).toHaveTextContent(
      'Realtidsdata og køreplan: Rejseplanen, under CC BY 4.0. Køreplan fra 2. juni.',
    )
    for (const sentence of STATE_KEYS.map((key) => da.about.states[key])) {
      expect(dialog).toHaveTextContent(sentence)
    }
    expect(fact(dialog, 'Kilde')).toBe('En optagelse, weekday')
    expect(fact(dialog, 'Positioner')).toBe('Meldinger og beregnede positioner på skift')
    expect(fact(dialog, 'Databudget')).toBe('Normalt')
    expect(fact(dialog, 'Kald denne måned')).toBe('7')
    expect(dialog).toHaveTextContent('lukker køretøjets kort eller panel')
    expect(dialog).toHaveTextContent(
      'Pauseknappen ved siden af zoomknapperne stopper køretøjerne, og afspilningsknappen sætter dem i gang igen.',
    )
    expect(keysIn(dialog)).toEqual(['+', '−', '←', '→', '↑', '↓', 'Esc'])
    act(() => {
      liveSnapshot.update({
        snapshot: {
          ...weekday,
          source: { kind: 'simulated', name: 'patchy' },
          positionMode: 'CALC_REPORT',
        },
      })
    })
    expect(fact(dialog, 'Kilde')).toBe('Simulerede køretøjer, scenarie patchy')
    expect(fact(dialog, 'Positioner')).toBe('Positioner beregnet af Rejseplanen')
    expect(dialog).toHaveTextContent(da.legend.noLive)
    act(() => {
      liveSnapshot.update({ snapshot: { ...weekday, source: { kind: 'rejseplanen' } } })
    })
    expect(fact(dialog, 'Kilde')).toBe('Rejseplanen')
  })

  it('names the simulation and Rejseplanen as sources, and says when no vehicle can be Live', () => {
    const simulated: Snapshot = {
      ...weekday,
      source: { kind: 'simulated', name: 'patchy' },
      positionMode: 'CALC_REPORT',
      answerMode: undefined,
    }
    show('en', simulated)
    let dialog = openDialog('About Mylder')
    expect(fact(dialog, 'Source')).toBe('Simulated vehicles, scenario patchy')
    expect(fact(dialog, 'Positions')).toBe('Positions computed by Rejseplanen')
    expect(dialog).toHaveTextContent(en.legend.noLive)
    act(() => {
      liveSnapshot.update({ snapshot: { ...weekday, source: { kind: 'rejseplanen' } } })
    })
    dialog = screen.getByRole('dialog', { name: 'About Mylder' })
    expect(fact(dialog, 'Source')).toBe('Rejseplanen')
    expect(dialog).not.toHaveTextContent('not real')
    expect(dialog).not.toHaveTextContent(en.legend.noLive)
  })

  it('gives the budget line when the poll has stretched, and the date live data resumes', () => {
    show('en', { ...weekday, pollInterval: 120, budget: { level: 'tight', calls: 41_000 } })
    let dialog = openDialog('About Mylder')
    expect(dialog).toHaveTextContent('Updating every 2 min to stay within the data budget.')
    expect(fact(dialog, 'Data budget')).toBe('Tight')
    expect(fact(dialog, 'Calls this month')).toBe('41,000')
    act(() => liveSnapshot.update({ snapshot: spent }))
    dialog = screen.getByRole('dialog', { name: 'About Mylder' })
    expect(dialog).toHaveTextContent(
      "Live data is paused until 1 July: this month's calls are used up.",
    )
    expect(fact(dialog, 'Disruptions')).toBe('Not checked yet')
  })

  it('gives a failed check the time of the last good one, as the Disruptions footer does', () => {
    const good = weekday.disruptions!
    show('en', {
      ...weekday,
      disruptions: { ...good, checked: good.checked + 15 * 60_000, ok: false },
    })
    let dialog = openDialog('About Mylder')
    expect(fact(dialog, 'Disruptions')).toBe('Last checked 07:20; the latest check failed.')
    act(() =>
      liveSnapshot.update({
        snapshot: { ...weekday, disruptions: { ...good, fetched: null, ok: false } },
      }),
    )
    dialog = screen.getByRole('dialog', { name: 'About Mylder' })
    expect(fact(dialog, 'Disruptions')).toBe('The latest check failed')
  })

  it('gives the budget line in Danish, in the page notice’s words', () => {
    show('da', { ...weekday, pollInterval: 90, budget: { level: 'stretched', calls: 30_000 } })
    const dialog = openDialog('Om Mylder')
    expect(dialog).toHaveTextContent(
      'Kortet opdateres hvert 90. sekund for at overholde databudgettet.',
    )
    expect(fact(dialog, 'Forespørgsel')).toBe('Hvert 90. sekund')
  })

  it('opens from the corner credit’s Rejseplanen link, and Esc closes it and returns focus', async () => {
    const user = userEvent.setup()
    show('en', weekday)
    const link = screen.getByRole('link', { name: 'Rejseplanen' })
    await user.click(link)
    expect(screen.getByRole('dialog', { name: 'About Mylder' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(link).toHaveFocus()
  })
})
