import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { disruptionListStore } from '../map/disruptions'
import { liveSnapshot } from '../map/live'
import type { Disruption, Disruptions, Snapshot } from '../tracker/index'
import { DisruptionList } from './DisruptionList'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

const MINUTE = 60_000

/** The weekday recording's first minute: 07:20 in Copenhagen on Tuesday 16 June 2026. */
const snapshot = JSON.parse(
  readFileSync(join(process.cwd(), 'recordings', 'weekday', 'snapshots', '0001.json'), 'utf8'),
) as Snapshot
const NOW = snapshot.fetched

/** A saved answer of the disruption route, from a recording's minute. */
const savedList = (name: string, recording = 'weekday'): Disruptions =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'recordings', recording, 'answers', 'disruptions', name),
      'utf8',
    ),
  ) as Disruptions

/**
 * The weekday recording's list: a 5C diversion, an S-tog signal fault and weekend works, checked
 * when the snapshot was fetched.
 */
const weekday = savedList('0001.json')
const [busDiversion, signalFault, weekendWorks] = weekday.messages as [
  Disruption,
  Disruption,
  Disruption,
]

/** The route's answer, changed. */
const answer = (change: Partial<Disruptions> = {}): Disruptions => ({ ...weekday, ...change })

/** Shows the tab with `list` as the route's answer, once it has landed. */
async function show(lang: Lang, list: Disruptions, budget: Snapshot['budget'] = snapshot.budget) {
  const store = disruptionListStore(() => Promise.resolve(list))
  liveSnapshot.update({
    snapshot: { ...snapshot, budget },
    lastGoodPoll: NOW - 20_000,
    clockOffset: 20_000,
  })
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <DisruptionList store={store} />
    </Providers>,
  )
  await act(async () => {})
}

/** Each card's title, in the order a list shows them. */
const titlesIn = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .filter((item) => item.parentElement === list)
    .map((card) => card.querySelector('.pn-DisruptionCard-title')?.textContent)

beforeEach(() => {
  // jsdom has no server: the timetable stays on its way, and the zone is Copenhagen's.
  vi.stubGlobal('fetch', () => new Promise(() => {}))
})

afterEach(() => {
  liveSnapshot.update({ snapshot: undefined, lastGoodPoll: undefined, clockOffset: 0 })
  vi.unstubAllGlobals()
})

describe('the Disruptions tab', () => {
  it('lists the messages active now, newest first, then Later, in English', async () => {
    await show('en', answer())
    expect(titlesIn(screen.getByRole('list', { name: 'Active now' }))).toEqual([
      'Færre S-tog mellem København H og Hellerup',
      'Linje 5C kører en anden rute ved Langebro',
    ])
    expect(titlesIn(screen.getByRole('list', { name: 'Later' }))).toEqual([
      'Ingen S-tog mellem Hellerup og Holte i weekenden',
    ])
    expect(screen.getByRole('region', { name: 'Later' })).toBeInTheDocument()
    expect(screen.queryByText(/^Running normally/)).not.toBeInTheDocument()
  })

  it('gives each card its kind, its stops, its time and its modes', async () => {
    await show('en', answer())
    const [fault, diversion] = within(screen.getByRole('list', { name: 'Active now' }))
      .getAllByRole('listitem')
      .filter((item) => item.classList.contains('pn-DisruptionCard'))
    // Its fields say no kind yet; running more than a day makes the diversion Planned works.
    expect(fault).toHaveTextContent('Service notice')
    expect(fault).toHaveTextContent('Between København H and Hellerup St.')
    expect(fault).toHaveTextContent('05:00 to 23:30')
    expect(within(fault).getByRole('list', { name: 'Modes' })).toHaveTextContent('S-tog')
    expect(diversion).toHaveTextContent('Planned works')
    expect(diversion).toHaveTextContent('15 to 18 June')
    const [weekend] = within(screen.getByRole('list', { name: 'Later' })).getAllByRole('listitem')
    expect(weekend).toHaveTextContent('20 to 21 June')
  })

  it('keeps Rejseplanen’s Danish words, marked as Danish in the English interface', async () => {
    await show('en', answer())
    const title = screen.getByText('Færre S-tog mellem København H og Hellerup')
    expect(title).toHaveAttribute('lang', 'da')
    expect(screen.getByText(/^Signalfejl ved Østerport/)).toHaveAttribute('lang', 'da')
    expect(screen.getAllByText('From Rejseplanen, in Danish')).toHaveLength(3)
  })

  it('opens the full text behind More', async () => {
    const user = userEvent.setup()
    await show('en', answer({ messages: [signalFault] }))
    const more = screen.getByRole('button', { name: 'More' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/^På grund af en signalfejl ved Østerport/)).toBeVisible()
  })

  it('says the same in Danish, with no caption on the Danish words', async () => {
    await show('da', answer())
    expect(titlesIn(screen.getByRole('list', { name: 'Aktuelle nu' }))).toHaveLength(2)
    expect(titlesIn(screen.getByRole('list', { name: 'Senere' }))).toEqual([
      'Ingen S-tog mellem Hellerup og Holte i weekenden',
    ])
    expect(screen.getByRole('list', { name: 'Aktuelle nu' })).toHaveTextContent('15. til 18. juni')
    expect(screen.queryByText('Fra Rejseplanen, på dansk')).not.toBeInTheDocument()
    expect(screen.getByText('Meddelelser fra Rejseplanen, tjekket 07:20.')).toBeInTheDocument()
    expect(screen.getByText('Tjekkes hvert 15. minut, mens kortet er åbent.')).toBeInTheDocument()
  })

  it('says when the list was checked, and how often', async () => {
    await show('en', answer())
    expect(screen.getByText('Messages from Rejseplanen, checked 07:20.')).toBeInTheDocument()
    expect(screen.getByText('Checked every 15 min while the map is open.')).toBeInTheDocument()
  })

  it('checks every 30 minutes at the tight level', async () => {
    await show('en', answer(), { level: 'tight', calls: 46_000 })
    expect(screen.getByText('Checked every 30 min while the map is open.')).toBeInTheDocument()
  })

  it('says nothing of how often once the month is spent', async () => {
    await show('en', answer(), { level: 'spent', calls: 49_500 })
    expect(screen.queryByText(/^Checked every/)).not.toBeInTheDocument()
  })

  it('shows Running normally once, with its check’s time, when nothing is active and the check succeeded', async () => {
    await show('en', answer({ messages: [], received: 0 }))
    expect(screen.getAllByText(/^Running normally/)).toHaveLength(1)
    expect(screen.getByText('Running normally, checked 07:20')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Active now' })).not.toBeInTheDocument()
  })

  it('says Kører normalt in Danish', async () => {
    await show('da', answer({ messages: [], received: 0 }))
    expect(screen.getAllByText('Kører normalt, tjekket 07:20')).toHaveLength(1)
  })

  it('still runs normally with only Later messages', async () => {
    await show('en', answer({ messages: [weekendWorks] }))
    expect(screen.getAllByText(/^Running normally/)).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Later' })).toBeInTheDocument()
  })

  it('closes a time ending at midnight on the day before it', async () => {
    const midnight = (date: string) => Date.parse(`${date}T00:00:00+02:00`)
    await show(
      'en',
      answer({
        messages: [
          { ...signalFault, to: midnight('2026-06-17') },
          { ...busDiversion, to: midnight('2026-06-19') },
        ],
      }),
    )
    const [fault, diversion] = within(screen.getByRole('list', { name: 'Active now' }))
      .getAllByRole('listitem')
      .filter((item) => item.classList.contains('pn-DisruptionCard'))
    expect(fault).toHaveTextContent('05:00 to 00:00')
    expect(diversion).toHaveTextContent('15 to 18 June')
  })

  it('gives a failed check the last good one’s time, and no Running normally', async () => {
    const fetched = NOW - 15 * MINUTE
    await show('en', answer({ fetched, ok: false, messages: [], received: 0 }))
    expect(screen.getByText('Last checked 07:05; the latest check failed.')).toBeInTheDocument()
    expect(screen.queryByText(/^Running normally/)).not.toBeInTheDocument()
  })

  it('says so in Danish', async () => {
    const fetched = NOW - 15 * MINUTE
    await show('da', answer({ fetched, ok: false, messages: [], received: 0 }))
    expect(
      screen.getByText('Sidst tjekket 07:05; det seneste tjek mislykkedes.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^Kører normalt/)).not.toBeInTheDocument()
  })

  it('says a check failed before any worked', async () => {
    await show('en', answer({ fetched: null, ok: false, messages: [], received: 0 }))
    expect(
      screen.getByText('Messages from Rejseplanen: the latest check failed.'),
    ).toBeInTheDocument()
  })

  it('says the list has not been checked before the first check, as a spent month’s', async () => {
    await show('en', savedList('0002.json', 'spent'))
    expect(screen.getByText('Messages from Rejseplanen, not checked yet.')).toBeInTheDocument()
    expect(screen.queryByText(/^Running normally/)).not.toBeInTheDocument()
  })

  it('marks a list more than an hour old as maybe out of date', async () => {
    const fetched = NOW - 2 * 60 * MINUTE
    await show('en', answer({ fetched, checked: fetched, messages: [], received: 0 }))
    expect(screen.getByText('Messages from Rejseplanen, checked 05:20.')).toBeInTheDocument()
    expect(screen.getByText('May be out of date.')).toBeInTheDocument()
    expect(screen.queryByText(/^Running normally/)).not.toBeInTheDocument()
  })

  it('warns that an answer of 100 messages may be incomplete, in both languages', async () => {
    await show('en', answer({ received: 100 }))
    expect(
      screen.getByText('Rejseplanen sends at most 100 messages, so the list may be incomplete.'),
    ).toBeInTheDocument()
  })

  it('warns so in Danish', async () => {
    await show('da', answer({ received: 100 }))
    expect(
      screen.getByText(
        'Rejseplanen sender højst 100 meddelelser, så listen kan være ufuldstændig.',
      ),
    ).toBeInTheDocument()
  })

  it('says so while the list is on its way', () => {
    liveSnapshot.update({ snapshot })
    render(
      <Providers lang="en" dictionary={en}>
        <DisruptionList store={disruptionListStore(() => new Promise(() => {}))} />
      </Providers>,
    )
    expect(screen.getByText('Loading messages from Rejseplanen…')).toBeInTheDocument()
  })

  it('counts its cards on the tab, loaded with the page before the tab opens', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL) =>
      String(input) === '/api/disruptions'
        ? Promise.resolve(Response.json(weekday))
        : new Promise(() => {}),
    )
    liveSnapshot.update({ snapshot, lastGoodPoll: NOW, clockOffset: 0 })
    render(
      <Providers lang="en" dictionary={en}>
        <MapScreen />
      </Providers>,
    )
    const tab = await screen.findByRole('tab', { name: /^Disruptions/ })
    await vi.waitFor(() => expect(tab).toHaveTextContent('Disruptions 3'))
    expect(screen.queryByRole('list', { name: 'Active now' })).not.toBeInTheDocument()
  })
})
