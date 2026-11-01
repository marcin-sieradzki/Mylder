import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { disruptionListStore } from '../map/disruptions'
import { mapHighlight } from '../map/highlight'
import { liveSnapshot } from '../map/live'
import { timetableRoutes } from '../test/timetableRoutes'
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

/** A saved snapshot of a recording's minute. */
const savedSnapshot = (name: string, recording: string): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', recording, 'snapshots', name), 'utf8'),
  ) as Snapshot

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

/**
 * Shows the tab with `list` as the route's answer, once it has landed, and `live` as the snapshot
 * the latest poll brought, at the server's moment `polled`.
 */
async function show(
  lang: Lang,
  list: Disruptions,
  { live = snapshot, polled = NOW }: { live?: Snapshot; polled?: number } = {},
) {
  const store = disruptionListStore(() => Promise.resolve(list))
  liveSnapshot.update({ snapshot: live, lastGoodPoll: polled - 20_000, clockOffset: 20_000 })
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
  // jsdom has no server: the timetable comes from the recording's files.
  vi.stubGlobal('fetch', timetableRoutes)
})

afterEach(() => {
  mapHighlight.clear()
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
    await show('en', answer(), { live: { ...snapshot, budget: { level: 'tight', calls: 46_000 } } })
    expect(screen.getByText('Checked every 30 min while the map is open.')).toBeInTheDocument()
  })

  it('says nothing of how often once the month is spent', async () => {
    await show('en', answer(), { live: { ...snapshot, budget: { level: 'spent', calls: 49_500 } } })
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
    // Mylder's own card at once, from a spent month's snapshot, then Rejseplanen's once they come.
    let comes: (response: Response) => void = () => {}
    const list = new Promise<Response>((resolve) => (comes = resolve))
    vi.stubGlobal('fetch', (input: RequestInfo | URL) =>
      String(input) === '/api/disruptions' ? list : new Promise(() => {}),
    )
    const spent = savedSnapshot('0003.json', 'spent')
    liveSnapshot.update({ snapshot: spent, lastGoodPoll: spent.fetched, clockOffset: 0 })
    render(
      <Providers lang="en" dictionary={en}>
        <MapScreen />
      </Providers>,
    )
    const tab = await screen.findByRole('tab', { name: /^Disruptions/ })
    expect(tab).toHaveTextContent('Disruptions 1')
    comes(Response.json(weekday))
    await vi.waitFor(() => expect(tab).toHaveTextContent('Disruptions 4'))
    expect(screen.queryByRole('list', { name: 'Active now' })).not.toBeInTheDocument()
  })
})

describe('Show on map', () => {
  /** The timetable's routes and the disruption route, as the server answers them. */
  const routes = (input: RequestInfo | URL) =>
    String(input) === '/api/disruptions'
      ? Promise.resolve(Response.json(weekday))
      : timetableRoutes(input)

  beforeEach(() => {
    vi.stubGlobal('fetch', routes)
  })

  it('rings the stops a card affects and draws its stretch, named by its heading', async () => {
    const user = userEvent.setup()
    await show('en', answer({ messages: [signalFault] }))
    const button = screen.getByRole('button', { name: 'Show on map' })
    await vi.waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    const shown = mapHighlight.get()
    expect(shown?.label).toEqual({ kind: 'text', text: signalFault.message.head })
    expect(shown?.stops.map(({ id }) => id)).toEqual(['8600626', '8600655'])
    expect(shown?.stops[0]?.colour).toBe('perron-color-transit-severity-notice')
    expect(shown?.lines.length).toBeGreaterThan(0)
  })

  it('is not offered on a message that names no stops', async () => {
    const {
      affectedStops: _,
      validFromStop: __,
      validToStop: ___,
      ...noStops
    } = signalFault.message
    await show('en', answer({ messages: [{ ...signalFault, message: noStops }] }))
    expect(screen.queryByRole('button', { name: 'Show on map' })).not.toBeInTheDocument()
  })

  it('has nothing to show for a message whose stops the timetable does not know', async () => {
    const aarhus = { name: 'Aarhus H', extId: '8600053', lon: 10.2, lat: 56.15 }
    const { validFromStop: _, validToStop: __, ...elsewhere } = signalFault.message
    await show(
      'en',
      answer({
        messages: [
          { ...signalFault, message: { ...elsewhere, affectedStops: { StopLocation: [aarhus] } } },
        ],
      }),
    )
    // Once the timetable has loaded, it knows none of them.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(screen.getByRole('button', { name: 'Show on map' })).toBeDisabled()
  })

  it('raises the chip over the map, in Danish, and Clear takes it down', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/da?tab=disruptions')
    liveSnapshot.update({ snapshot, lastGoodPoll: NOW, clockOffset: 0 })
    render(
      <Providers lang="da" dictionary={da}>
        <MapScreen />
      </Providers>,
    )
    const active = await screen.findByRole('list', { name: 'Aktuelle nu' })
    const [fault] = within(active)
      .getAllByRole('listitem')
      .filter((item) => item.classList.contains('pn-DisruptionCard'))
    const button = within(fault!).getByRole('button', { name: 'Vis på kortet' })
    await vi.waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    const chip = screen.getByRole('button', {
      name: `Viser: ${signalFault.message.head} · Ryd`,
    })
    await user.click(chip)
    expect(mapHighlight.get()).toBeUndefined()
    expect(chip).not.toBeInTheDocument()
  })
})

describe("Mylder's own data cards", () => {
  const mine = () => screen.queryByRole('list', { name: 'From Mylder' })
  const titles = () => titlesIn(screen.getByRole('list', { name: 'From Mylder' }))
  const failing: Snapshot = { ...snapshot, api: { status: 'error', since: NOW } }

  it('are none on a healthy snapshot, in either language', async () => {
    await show('en', answer())
    expect(mine()).not.toBeInTheDocument()
    cleanup()
    await show('da', answer())
    expect(screen.queryByRole('list', { name: 'Fra Mylder' })).not.toBeInTheDocument()
  })

  it('are none on the timetable source, hours after its last snapshot, in either language', async () => {
    // No call is made there, so no gap is Mylder's to report, however old its snapshot.
    const onTimetable = savedSnapshot('0006.json', 'timetable-source')
    const list = savedList('0006.json', 'timetable-source')
    const later = { live: onTimetable, polled: onTimetable.fetched + 3 * 60 * MINUTE }
    await show('en', list, later)
    expect(mine()).not.toBeInTheDocument()
    cleanup()
    await show('da', list, later)
    expect(screen.queryByRole('list', { name: 'Fra Mylder' })).not.toBeInTheDocument()
  })

  it('say live data is paused until the 1st while the month is spent, first in the list', async () => {
    await show('en', answer(), { live: savedSnapshot('0003.json', 'spent') })
    expect(titles()).toEqual(['Live data paused until 1 July'])
    const [card] = within(mine()!).getAllByRole('listitem')
    expect(card).toHaveTextContent('Data feed problems')
    expect(card).toHaveTextContent('From Mylder, about its own data')
    const lists = screen
      .getAllByRole('list')
      .filter((list) => list.parentElement?.tagName === 'DIV')
    expect(lists[0]).toBe(mine())
  })

  it('say so in Danish', async () => {
    await show('da', answer(), { live: savedSnapshot('0003.json', 'spent') })
    expect(titlesIn(screen.getByRole('list', { name: 'Fra Mylder' }))).toEqual([
      'Livedata er sat på pause indtil 1. juli',
    ])
  })

  it('say Rejseplanen has not answered once it has answered nothing for 5 minutes', async () => {
    // Rejseplanen failing since 07:20, the minute its last answer carried every mode.
    await show('en', answer(), { live: failing, polled: NOW + 4 * MINUTE })
    expect(mine()).not.toBeInTheDocument()
    cleanup()
    await show('en', answer(), { live: failing, polled: NOW + 5 * MINUTE })
    expect(titles()).toEqual(['No answer from Rejseplanen since 07:20'])
  })

  it('say Intet svar fra Rejseplanen in Danish', async () => {
    await show('da', answer(), { live: failing, polled: NOW + 6 * MINUTE })
    expect(titlesIn(screen.getByRole('list', { name: 'Fra Mylder' }))).toEqual([
      'Intet svar fra Rejseplanen siden 07:20',
    ])
  })

  it('name a mode whose positions stopped 5 minutes ago while its trips run', async () => {
    const quietBuses = {
      ...snapshot,
      lastSeen: { ...snapshot.lastSeen, bus: NOW - 6 * MINUTE },
    }
    await show('en', answer(), { live: quietBuses })
    expect(titles()).toEqual(['No bus positions since 07:14'])
    cleanup()
    await show('da', answer(), { live: quietBuses })
    expect(titlesIn(screen.getByRole('list', { name: 'Fra Mylder' }))).toEqual([
      'Ingen buspositioner siden 07:14',
    ])
  })

  it('say the messages are not updated a while after a failed check', async () => {
    const failed = {
      ...snapshot,
      disruptions: { ...snapshot.disruptions!, fetched: NOW - 20 * MINUTE, ok: false },
    }
    await show('en', answer(), { live: failed })
    expect(titles()).toEqual(['Disruption messages not updated since 07:00'])
    cleanup()
    await show('da', answer(), { live: failed })
    expect(titlesIn(screen.getByRole('list', { name: 'Fra Mylder' }))).toEqual([
      'Driftsmeddelelser ikke opdateret siden 07:00',
    ])
  })
})

describe("Mylder's card for a quiet SIRI-ET feed", () => {
  // The SIRI-ET recording's saved minute of 09:22:00 on the timetable source, whose feed's last
  // message came at 09:21:52: Rejseplanen's messages need the live connection, so the tab says so,
  // and the delays' card, shown first, says when they were last updated.
  const withDelays = savedSnapshot('0002.json', 'siri-et')
  const list = savedList('0002.json', 'siri-et')
  const lastMessage = withDelays.updates.lastMessage!
  const quiet = { live: withDelays, polled: lastMessage + 5 * MINUTE }
  const noMessages = {
    en: "Disruption messages come with Rejseplanen's live connection, which isn't connected yet.",
  }
  const mine = (name = 'From Mylder') => screen.queryByRole('list', { name })

  it('is none while the feed is fresh', async () => {
    await show('en', list, { live: withDelays, polled: lastMessage + 5 * MINUTE - 1000 })
    expect(mine()).not.toBeInTheDocument()
    expect(screen.getByText(noMessages.en)).toBeInTheDocument()
  })

  it('says the delays are not updated since the last message, 5 minutes on, first', async () => {
    await show('en', list, quiet)
    expect(titlesIn(mine()!)).toEqual(['Delays from Rejseplanen not updated since 09:21'])
    const [card] = within(mine()!).getAllByRole('listitem')
    expect(card).toHaveTextContent('Data feed problems')
    expect(card).toHaveTextContent('From Mylder, about its own data')
    // Above the sentence in place of Rejseplanen's messages.
    const sentence = screen.getByText(noMessages.en)
    expect(mine()!.compareDocumentPosition(sentence)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('says so in Danish', async () => {
    await show('da', list, quiet)
    expect(titlesIn(mine('Fra Mylder')!)).toEqual([
      'Forsinkelser fra Rejseplanen ikke opdateret siden 09:21',
    ])
  })

  it('says none has come yet when the feed has never sent one, in either language', async () => {
    const { lastMessage: _, ...never } = withDelays.updates
    const live = { ...withDelays, updates: never }
    await show('en', list, { live })
    expect(titlesIn(mine()!)).toEqual(['Delays from Rejseplanen not received yet'])
    cleanup()
    await show('da', list, { live })
    expect(titlesIn(mine('Fra Mylder')!)).toEqual([
      'Forsinkelser fra Rejseplanen endnu ikke modtaget',
    ])
  })

  it('goes with the next message', async () => {
    const next = { ...withDelays, updates: { ...withDelays.updates, lastMessage: quiet.polled } }
    await show('en', list, { live: next, polled: quiet.polled + 20_000 })
    expect(mine()).not.toBeInTheDocument()
  })
})
