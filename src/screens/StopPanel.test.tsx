import '@mylder/perron/tokens.css'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { PHONE_QUERY } from '../map/highlight'
import { liveSnapshot } from '../map/live'
import { mapView, openPanel } from '../map/view'
import type {
  Disruption,
  Snapshot,
  StandingTrip,
  StopArrival,
  StopArrivals,
  StopDeparture,
  StopDepartures,
} from '../tracker/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// A stop's departures panel from the stop route's answers saved with the weekday recording, at
// the start of its second minute, 07:21:00 in Copenhagen. jsdom has no server: the route answers
// from those files, and a test changes one where the recording shows no such case.
const saved = (stop: string, recording = 'weekday'): StopDepartures =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'recordings', recording, 'answers', 'stops', `${stop}.json`),
      'utf8',
    ),
  ) as StopDepartures

/** Nørreport St.: Live and Estimated departures by bus and S-tog. */
const NORREPORT = saved('27532')
/** Orientkaj St.: one Timetable only bus. */
const ORIENTKAJ = saved('54307')
/** Hillerød St.: none in the next 30 minutes. */
const HILLEROD = saved('8600683')
/** Bella Center St.: the Metro alone, every 4 minutes towards Vestamager. */
const BELLA_CENTER = saved('8603313')
/** Refshaleøen: the 991 to Teglholmen standing at the stop until 07:23, Estimated. */
const REFSHALEOEN = saved('48645')

/** A stop's arrivals, saved with the recording beside its departures at the same moment. */
const savedArrivals = (stop: string): StopArrivals =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'recordings', 'weekday', 'answers', 'arrivals', `${stop}.json`),
      'utf8',
    ),
  ) as StopArrivals

/** Nørreport St.'s arrivals: Live and Estimated buses and S-tog, each from where it comes. */
const NORREPORT_ARRIVALS = savedArrivals('27532')
/** Bella Center St.'s arrivals: the Metro alone, every 4 minutes from Vanløse. */
const BELLA_CENTER_ARRIVALS = savedArrivals('8603313')
/** Hillerød St.'s arrivals: none in the next 30 minutes. */
const HILLEROD_ARRIVALS = savedArrivals('8600683')
/** Refshaleøen's arrivals: the 991 from Orientkaj St. at 07:47, Timetable only. */
const REFSHALEOEN_ARRIVALS = savedArrivals('48645')

/** The stop route's answers by stop id; a stop missing here is a 404. */
let answers: Map<string, StopDepartures>
/** The arrivals route's answers by stop id; a stop missing here is a 404. */
let arrivalAnswers: Map<string, StopArrivals>
/** Every route the page asked, in order. */
let asked: string[]

const routes = async (input: RequestInfo | URL): Promise<Response> => {
  asked.push(String(input))
  const [, id, arrivals] = /^\/api\/stops\/([^/]+)(\/arrivals)?$/.exec(String(input)) ?? []
  const stop = id === undefined ? undefined : decodeURIComponent(id)
  const answer = stop === undefined ? undefined : (arrivals ? arrivalAnswers : answers).get(stop)
  if (!answer) return Response.json({ error: 'unknown stop' }, { status: 404 })
  return Response.json(answer)
}

/** `answer` with the departure of `trip` changed by `change`. */
const withRow = (
  answer: StopDepartures,
  trip: string,
  change: Partial<StopDeparture>,
): StopDepartures => ({
  ...answer,
  departures: answer.departures.map((row) => (row.trip === trip ? { ...row, ...change } : row)),
})

const E_TO_KOGE = 's-tog.E.e8dc141a28.20260616.0702'
const BUS_TO_HUSUM = 'bus.5C.32331e0e20.20260616.0707'

function openStop(lang: Lang, search: string) {
  window.history.replaceState(null, '', `/${lang}${search}`)
  return render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )
}

/** The open panel, once its answer has landed. */
const panel = async (name: string) => screen.findByRole('dialog', { name })

/** The departure row that names `destination`, the first if several do. */
const row = (within_: HTMLElement, destination: string) =>
  within(within_)
    .getAllByRole('listitem')
    .find((each) => each.textContent?.includes(destination))!

/** Whether the page is as narrow as a phone, as each test sets it. */
let phone = false
const phoneChanges = new Set<() => void>()
const mediaLists = new Map<string, object>()
/**
 * The browser's `matchMedia`, which jsdom lacks: only the phone's query matches, and only while
 * `phone` is set. One list per query for the whole file, as the page keeps its list.
 */
function matchMedia(query: string) {
  let list = mediaLists.get(query)
  if (!list) {
    list = {
      get matches() {
        return query === PHONE_QUERY && phone
      },
      addEventListener: (_: string, listener: () => void) => phoneChanges.add(listener),
      removeEventListener: (_: string, listener: () => void) => phoneChanges.delete(listener),
    }
    mediaLists.set(query, list)
  }
  return list
}

beforeEach(() => {
  phone = false
  vi.stubGlobal('matchMedia', matchMedia)
  // The server's clock reads the answers' moment; this device's is the server's, as the page's
  // first snapshot has said.
  vi.useFakeTimers({ toFake: ['Date'], now: NORREPORT.fetched })
  liveSnapshot.update({ clockOffset: 0 })
  answers = new Map([
    ['27532', NORREPORT],
    ['54307', ORIENTKAJ],
    ['8600683', HILLEROD],
    ['8603313', BELLA_CENTER],
    ['48645', REFSHALEOEN],
  ])
  arrivalAnswers = new Map([
    ['27532', NORREPORT_ARRIVALS],
    ['8603313', BELLA_CENTER_ARRIVALS],
    ['8600683', HILLEROD_ARRIVALS],
    ['48645', REFSHALEOEN_ARRIVALS],
  ])
  asked = []
  vi.stubGlobal('fetch', routes)
})

afterEach(() => {
  act(() => openPanel(undefined))
  act(() => liveSnapshot.update({ snapshot: undefined }))
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("a stop's departures", () => {
  it('opens the stop in the address, with its name, its lines and the next 30 minutes', async () => {
    openStop('en', '?stop=27532')
    const stop = await panel('Nørreport St.')
    const lines = within(stop).getByRole('list', { name: 'Lines' })
    expect(
      within(lines)
        .getAllByRole('listitem')
        .map((each) => each.textContent),
    ).toEqual(['5C', 'M1', 'A', 'E'])
    const departures = within(stop).getByRole('list', { name: 'Departures' })
    expect(within(departures).getAllByRole('listitem')).toHaveLength(10)
    // The soonest: line E, two minutes late, its timetabled time struck beside the expected one.
    const first = within(departures).getAllByRole('listitem')[0]
    expect(first).toHaveTextContent('Køge St.')
    expect(first).toHaveTextContent('Live')
    expect(first).toHaveTextContent('8 min')
    expect(first).toHaveTextContent('+2')
    const timetabled = within(first).getByText('07:27')
    expect(getComputedStyle(timetabled).textDecorationLine).toBe('line-through')
    expect(within(first).getByText('07:29')).toBeInTheDocument()
  })

  it('reads an Estimated departure’s time with "~"', async () => {
    openStop('en', '?stop=27532')
    const husum = row(await panel('Nørreport St.'), 'Husum Torv')
    expect(husum).toHaveTextContent('Estimated')
    expect(within(husum).getByText('07:38')).toHaveTextContent(/^~07:38$/)
  })

  it('keeps a cancelled departure, marked Cancelled with its countdown struck', async () => {
    answers.set('27532', withRow(NORREPORT, E_TO_KOGE, { cancelled: true }))
    openStop('en', '?stop=27532')
    const stop = await panel('Nørreport St.')
    const koge = row(stop, 'Køge St.')
    expect(koge).toHaveTextContent('Cancelled')
    expect(koge).not.toHaveTextContent('Live')
    // The countdown's figure sits in the countdown, which the row strikes.
    const countdown = within(koge).getByText('8').parentElement!
    expect(getComputedStyle(countdown).textDecorationLine).toBe('line-through')
    // Its timetabled time, struck, and not the expected one it won't keep.
    expect(getComputedStyle(within(koge).getByText('07:27')).textDecorationLine).toBe(
      'line-through',
    )
    expect(within(koge).queryByText('07:29')).not.toBeInTheDocument()
    expect(within(stop).getByRole('list', { name: 'Departures' }).children).toHaveLength(10)
  })

  it('gives a Timetable only departure its timetabled time and an unknown delay', async () => {
    openStop('en', '?stop=54307')
    const teglholmen = row(await panel('Orientkaj St.'), 'Teglholmen')
    expect(teglholmen).toHaveTextContent('Timetable only')
    expect(within(teglholmen).getByText('07:30')).toBeInTheDocument()
    expect(teglholmen).toHaveTextContent('—')
  })

  it('gives a No signal departure its timetabled time and an unknown delay', async () => {
    answers.set('27532', withRow(NORREPORT, BUS_TO_HUSUM, { state: 'no-signal' }))
    openStop('en', '?stop=27532')
    const husum = row(await panel('Nørreport St.'), 'Husum Torv')
    expect(husum).toHaveTextContent('No signal')
    expect(within(husum).getByText('07:36')).toBeInTheDocument()
    expect(husum).toHaveTextContent('—')
    expect(within(husum).queryByText('07:38')).not.toBeInTheDocument()
    // Its delay is unknown too, not the last one it had.
    expect(husum).not.toHaveTextContent('+2')
  })

  it('ages a row’s state with its trip on the map, and keeps the board’s realtime Estimated', async () => {
    // The page's snapshot of the answers' minute, where the bus to Husum has gone quiet.
    const page = JSON.parse(
      readFileSync(join(process.cwd(), 'recordings', 'weekday', 'snapshots', '0002.json'), 'utf8'),
    ) as Snapshot
    const snapshot: Snapshot = {
      ...page,
      trips: page.trips.map((trip) =>
        trip.key === BUS_TO_HUSUM
          ? {
              ...trip,
              state: 'no-signal',
              hadRealtime: true,
              seen: page.fetched - 10 * 60_000,
              reported: undefined,
              updated: undefined,
            }
          : trip,
      ),
    }
    act(() => liveSnapshot.update({ snapshot }))
    const { unmount } = openStop('en', '?stop=27532')
    expect(row(await panel('Nørreport St.'), 'Husum Torv')).toHaveTextContent('No signal')
    unmount()
    answers.set('27532', fromBoard(NORREPORT))
    openStop('en', '?stop=27532')
    const husum = row(await panel('Nørreport St.'), 'Husum Torv')
    expect(husum).toHaveTextContent('Estimated')
    expect(within(husum).getByText('07:38')).toHaveTextContent(/^~07:38$/)
  })

  it('says so when no departure leaves in the next 30 minutes', async () => {
    openStop('en', '?stop=8600683')
    const stop = await panel('Hillerød St.')
    expect(stop).toHaveTextContent(
      'No departures in the next 30 minutes for the vehicle types shown.',
    )
  })

  it('leaves out the modes the filters hide, and says so when that leaves none', async () => {
    openStop('en', '?stop=27532&hide=s-tog')
    const stop = await panel('Nørreport St.')
    expect(within(stop).getByRole('list', { name: 'Departures' }).children).toHaveLength(4)
    act(() => mapView.update({ hidden: new Set(['bus', 's-tog']) }))
    expect(stop).toHaveTextContent(
      'No departures in the next 30 minutes for the vehicle types shown.',
    )
  })

  it('says its times come from the timetable and the positions of 07:21:00', async () => {
    openStop('en', '?stop=27532')
    const stop = await panel('Nørreport St.')
    expect(stop).toHaveTextContent('From the timetable')
    expect(stop).toHaveTextContent('Timetable and positions 07:21:00')
  })

  it('names Rejseplanen and the time of its call when the answer came from the board', async () => {
    // 07:21:20 in Copenhagen.
    answers.set('27532', {
      ...NORREPORT,
      source: { kind: 'rejseplanen', at: NORREPORT.fetched + 20_000 },
    })
    openStop('en', '?stop=27532')
    const stop = await panel('Nørreport St.')
    expect(stop).toHaveTextContent('Rejseplanen · departures 07:21:20')
    expect(stop).not.toHaveTextContent('may be out of date')
    expect(stop).not.toHaveTextContent('From the timetable')
  })

  it('says the same in Danish', async () => {
    answers.set('27532', withRow(NORREPORT, E_TO_KOGE, { cancelled: true }))
    openStop('da', '?stop=27532')
    const stop = await panel('Nørreport St.')
    expect(within(stop).getByRole('list', { name: 'Linjer' })).toBeInTheDocument()
    expect(within(stop).getByRole('list', { name: 'Afgange' }).children).toHaveLength(10)
    expect(row(stop, 'Køge St.')).toHaveTextContent('Aflyst')
    const husum = row(stop, 'Husum Torv')
    expect(husum).toHaveTextContent('Beregnet')
    expect(within(husum).getByText('07:38')).toHaveTextContent(/^~07:38$/)
    expect(stop).toHaveTextContent('Fra køreplanen')
    expect(stop).toHaveTextContent('Køreplan og positioner 07:21:00')
  })

  it('says when none leave, in Danish', async () => {
    openStop('da', '?stop=8600683')
    const stop = await panel('Hillerød St.')
    expect(stop).toHaveTextContent(
      'Ingen afgange de næste 30 minutter for de viste transportformer.',
    )
  })

  it('says a stop the route doesn’t know is not found, in both languages', async () => {
    const { unmount } = openStop('en', '?stop=nowhere')
    expect(await panel('Stop not found')).toBeInTheDocument()
    unmount()
    openStop('da', '?stop=nowhere')
    expect(await panel('Stoppestedet findes ikke')).toBeInTheDocument()
  })

  it('opens a departure’s trip, in place of the stop', async () => {
    openStop('en', '?stop=27532&hide=train')
    const koge = row(await panel('Nørreport St.'), 'Køge St.')
    fireEvent.click(within(koge).getByRole('button', { name: 'S-tog E to Køge St.' }))
    expect(window.location.search).toBe(`?hide=train&trip=${E_TO_KOGE}`)
  })

  it('closes on its close button and on Esc, and leaves the address', async () => {
    openStop('en', '?stop=27532&hide=train')
    const stop = await panel('Nørreport St.')
    fireEvent.click(within(stop).getByRole('button', { name: 'Close' }))
    expect(window.location.search).toBe('?hide=train')
    act(() => openPanel({ kind: 'stop', id: '27532' }))
    await panel('Nørreport St.')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(window.location.search).toBe('?hide=train')
  })

  it('closes on Esc with the focus on the map, away from the panel', async () => {
    openStop('en', '?stop=27532')
    await panel('Nørreport St.')
    act(() => (document.activeElement as HTMLElement | null)?.blur())
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(window.location.search).toBe('')
  })
})

/** `answer` as a board call made `ago` ms before the answers' moment gives it. */
const fromBoard = (answer: StopDepartures, ago = 0): StopDepartures => ({
  ...answer,
  source: { kind: 'rejseplanen', at: answer.fetched - ago },
})

const HOUR = 3600_000

/** A message as the stop's answer carries it: Rejseplanen's, in Danish, with its validity. */
const message = (id: string, head: string, from: number, to: number): Disruption => ({
  fieldsKind: 'service-notice',
  modes: ['bus'],
  from,
  to,
  message: {
    id,
    head,
    lead: 'Linje 5C kører ikke via Nørreport.',
    affectedStops: {
      StopLocation: [{ name: 'Nørreport St.', extId: '27532', lon: 12.5718, lat: 55.6834 }],
    },
  },
})
const CLOSED = message(
  'm1',
  'Nørreport lukket for busser',
  NORREPORT.fetched - HOUR,
  NORREPORT.fetched + HOUR,
)
const WORKS = message(
  'm2',
  'Sporarbejde ved Nørreport',
  NORREPORT.fetched + 2 * 24 * HOUR,
  NORREPORT.fetched + 3 * 24 * HOUR,
)

describe("a stop's departures from its board", () => {
  it('shows the board’s track on a row that has one', async () => {
    answers.set('27532', withRow(fromBoard(NORREPORT), E_TO_KOGE, { track: '4' }))
    openStop('en', '?stop=27532')
    expect(row(await panel('Nørreport St.'), 'Køge St.')).toHaveTextContent('Track 4')
  })

  it('shows the stop’s messages as cards, those starting later under Later', async () => {
    answers.set('27532', { ...fromBoard(NORREPORT), messages: [WORKS, CLOSED] })
    openStop('en', '?stop=27532')
    const stop = await panel('Nørreport St.')
    const cards = within(stop).getByRole('region', { name: 'Messages' })
    const [closed, works] = within(cards).getAllByRole('listitem')
    expect(closed).toHaveTextContent('Service notice')
    expect(closed).toHaveTextContent('Nørreport lukket for busser')
    expect(closed).toHaveTextContent('Linje 5C kører ikke via Nørreport.')
    expect(closed).toHaveTextContent('Affects Nørreport St.')
    expect(cards).toHaveTextContent('From Rejseplanen, in Danish')
    expect(works).toHaveTextContent('Planned works')
    expect(works).toHaveTextContent('Sporarbejde ved Nørreport')
    expect(within(stop).getByRole('heading', { name: 'Later' })).toBeInTheDocument()
  })

  it('says a board answer over a minute old may be out of date', async () => {
    // Called at 07:19:50, 70 s before the answers' moment.
    answers.set('27532', fromBoard(NORREPORT, 70_000))
    openStop('en', '?stop=27532')
    expect(await panel('Nørreport St.')).toHaveTextContent(
      'Rejseplanen · departures 07:19:50, may be out of date',
    )
  })

  it('says the same in Danish', async () => {
    answers.set('27532', {
      ...withRow(fromBoard(NORREPORT, 70_000), E_TO_KOGE, { track: '4' }),
      messages: [CLOSED, WORKS],
    })
    openStop('da', '?stop=27532')
    const stop = await panel('Nørreport St.')
    expect(row(stop, 'Køge St.')).toHaveTextContent('Spor 4')
    const cards = within(stop).getByRole('region', { name: 'Meddelelser' })
    expect(within(cards).getAllByRole('listitem')[0]).toHaveTextContent('Driftsmeddelelse')
    expect(cards).toHaveTextContent('Fra Rejseplanen')
    expect(cards).not.toHaveTextContent('in Danish')
    expect(within(stop).getByRole('heading', { name: 'Senere' })).toBeInTheDocument()
    expect(stop).toHaveTextContent('Rejseplanen · afgange 07:19:50, måske forældet')
  })
})

/** A Metro row the stop's answer gives as ordinary, once the snapshot carried Metro realtime. */
const LIVE_METRO: StopDeparture = {
  trip: 'metro.M1.0b1c2d3e4f.20260616.0703',
  line: 'M1',
  mode: 'metro',
  colour: 'perron-color-transit-line-m1',
  headsign: 'Vestamager St. (Metro)',
  platform: '8603313',
  scheduled: BELLA_CENTER.fetched + 2 * 60_000,
  expected: BELLA_CENTER.fetched + 3 * 60_000,
  state: 'live',
}

describe("a Metro platform's departures", () => {
  it('reads as an interval with the note, and no countdown or clock time', async () => {
    openStop('en', '?stop=8603313')
    const stop = await panel('Bella Center St.')
    const metro = row(stop, 'Vestamager')
    expect(metro).toHaveTextContent('Every 4 min')
    expect(metro).toHaveTextContent('Metro: planned times')
    expect(metro).not.toHaveTextContent(/\d\d:\d\d/)
    expect(metro.querySelector('time')).toBeNull()
  })

  it('reads a range when the gaps round to different minutes', async () => {
    answers.set('8603313', {
      ...BELLA_CENTER,
      intervals: BELLA_CENTER.intervals.map((each) => ({ ...each, every: { from: 3, to: 4 } })),
    })
    openStop('en', '?stop=8603313')
    expect(row(await panel('Bella Center St.'), 'Vestamager')).toHaveTextContent('Every 3 to 4 min')
  })

  it('gives the Metro intervals and the buses countdowns at a stop with both', async () => {
    answers.set('27532', {
      ...NORREPORT,
      intervals: [{ ...BELLA_CENTER.intervals[0], platform: '8603307', every: { from: 3, to: 3 } }],
    })
    openStop('en', '?stop=27532')
    const stop = await panel('Nørreport St.')
    expect(within(stop).getByRole('list', { name: 'Departures' }).children).toHaveLength(11)
    const metro = row(stop, 'Vestamager')
    expect(metro).toHaveTextContent('Every 3 min')
    expect(metro).toHaveTextContent('Metro: planned times')
    const husum = row(stop, 'Husum Torv')
    expect(husum).toHaveTextContent('Estimated')
    expect(within(husum).getByText('07:38')).toHaveTextContent(/^~07:38$/)
  })

  it('shows ordinary Metro rows when the answer carried Metro realtime', async () => {
    answers.set('8603313', { ...BELLA_CENTER, departures: [LIVE_METRO], intervals: [] })
    openStop('en', '?stop=8603313')
    const metro = row(await panel('Bella Center St.'), 'Vestamager')
    expect(metro).toHaveTextContent('Live')
    expect(metro).toHaveTextContent('3 min')
    expect(within(metro).getByText('07:24')).toBeInTheDocument()
    expect(metro).not.toHaveTextContent('Every')
    expect(metro).not.toHaveTextContent('Metro: planned times')
  })

  it('leaves the Metro out when the filters hide it', async () => {
    openStop('en', '?stop=8603313&hide=metro')
    expect(await panel('Bella Center St.')).toHaveTextContent(
      'No departures in the next 30 minutes for the vehicle types shown.',
    )
  })

  it('says the same in Danish', async () => {
    answers.set('27532', {
      ...NORREPORT,
      intervals: [{ ...BELLA_CENTER.intervals[0], platform: '8603307', every: { from: 3, to: 3 } }],
    })
    answers.set('8603313', { ...BELLA_CENTER, departures: [LIVE_METRO], intervals: [] })
    const { unmount } = openStop('da', '?stop=27532')
    const stop = await panel('Nørreport St.')
    const metro = row(stop, 'Vestamager')
    expect(metro).toHaveTextContent('Hvert 3. min')
    expect(metro).toHaveTextContent('Metro: planlagte tider')
    expect(metro.querySelector('time')).toBeNull()
    expect(row(stop, 'Husum Torv')).toHaveTextContent('Beregnet')
    unmount()
    act(() => openPanel({ kind: 'stop', id: '8603313' }))
    openStop('da', '?stop=8603313')
    const live = row(await panel('Bella Center St.'), 'Vestamager')
    expect(live).toHaveTextContent('Live')
    expect(live).not.toHaveTextContent('Hvert')
  })
})

const BUS_991 = 'bus.991.7ce514fd98.20260616.0700'

/** An S-tog standing at track `track` of Refshaleøen, as a board would give it, by hand. */
const standingTrain = (n: number, change: Partial<StandingTrip> = {}): StandingTrip => ({
  trip: `s-tog.A.standing${n}.20260616.0700`,
  line: 'A',
  mode: 's-tog',
  colour: 'perron-color-transit-line-a',
  headsign: `Destination ${n}`,
  platform: '48645',
  track: String(n),
  scheduled: REFSHALEOEN.fetched + n * 60_000,
  expected: REFSHALEOEN.fetched + n * 60_000,
  departs: REFSHALEOEN.fetched + n * 60_000,
  state: 'live',
  ...change,
})

/** Refshaleøen with `standing` in place of its own standing trips. */
const standingAt = (standing: readonly StandingTrip[]): StopDepartures => ({
  ...REFSHALEOEN,
  standing,
})

/** The panel's section of the trips standing at the stop's platforms. */
const standingSection = (stop: HTMLElement, name = 'At the platforms now') =>
  within(stop).getByRole('region', { name })

describe('the trips standing at a stop’s platforms', () => {
  it('lists each above the departures, with its line, destination, time and data state', async () => {
    openStop('en', '?stop=48645')
    const stop = await panel('Refshaleøen')
    const section = standingSection(stop)
    const [bus] = within(section).getAllByRole('listitem')
    expect(within(section).getAllByRole('listitem')).toHaveLength(1)
    expect(bus).toHaveTextContent('991')
    expect(bus).toHaveTextContent('Teglholmen')
    expect(bus).toHaveTextContent('Estimated')
    expect(bus).toHaveTextContent('2 min')
    expect(within(bus).getByText('07:23')).toHaveTextContent(/^~07:23$/)
    // Above the departures, which are a tab's panel of their own, named.
    const departures = within(stop).getByRole('tabpanel', { name: 'Departures' })
    expect(section.compareDocumentPosition(departures)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(within(departures).getByRole('list', { name: 'Departures' })).toHaveTextContent(
      'Teglholmen',
    )
  })

  it('gives a standing trip’s track, as its board names it', async () => {
    answers.set('48645', standingAt([standingTrain(5)]))
    openStop('en', '?stop=48645')
    const [train] = within(standingSection(await panel('Refshaleøen'))).getAllByRole('listitem')
    expect(train).toHaveTextContent('Track 5')
    expect(train).toHaveTextContent('Live')
  })

  it('says a trip that ends here ends here, with no time it leaves', async () => {
    answers.set(
      '48645',
      standingAt([
        standingTrain(1, {
          ends: true,
          departs: undefined,
          scheduled: undefined,
          expected: undefined,
          state: 'timetable-only',
        }),
      ]),
    )
    openStop('en', '?stop=48645')
    const [train] = within(standingSection(await panel('Refshaleøen'))).getAllByRole('listitem')
    expect(train).toHaveTextContent('Ends here')
    expect(train).toHaveTextContent('Timetable only')
    expect(train).not.toHaveTextContent(/\d\d:\d\d/)
  })

  it('opens a standing trip’s vehicle, in place of the stop', async () => {
    openStop('en', '?stop=48645')
    const section = standingSection(await panel('Refshaleøen'))
    fireEvent.click(within(section).getByRole('button', { name: 'Bus 991 to Teglholmen' }))
    expect(window.location.search).toBe(`?trip=${BUS_991}`)
  })

  it('shows 4 of more, and the rest on Show all', async () => {
    answers.set('48645', standingAt([1, 2, 3, 4, 5, 6].map((n) => standingTrain(n))))
    openStop('en', '?stop=48645')
    const section = standingSection(await panel('Refshaleøen'))
    const destinations = () =>
      within(section)
        .getAllByRole('listitem')
        .map((each) => /Destination \d/.exec(each.textContent ?? '')?.[0])
    expect(destinations()).toEqual([1, 2, 3, 4].map((n) => `Destination ${n}`))
    const all = within(section).getByRole('button', { name: 'Show all 6' })
    expect(all).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(all)
    expect(destinations()).toEqual([1, 2, 3, 4, 5, 6].map((n) => `Destination ${n}`))
    expect(all).toHaveAttribute('aria-expanded', 'true')
    expect(all).toHaveTextContent('Show fewer')
  })

  it('shows 4 of the six trains standing at København H on the crowded recording, and the rest on Show all', async () => {
    // Its stop route's answer at 07:22:00, saved with the recording.
    const crowded = saved('8600626', 'crowded')
    vi.setSystemTime(crowded.fetched)
    answers.set('8600626', crowded)
    openStop('en', '?stop=8600626')
    const section = standingSection(await panel('København H'))
    const trains = () =>
      within(section)
        .getAllByRole('listitem')
        .map((each) => within(each).getByRole('button').getAttribute('aria-label'))
    expect(trains()).toEqual([
      'Train RE to Næstved St.',
      'S-tog A to Hundige St.',
      'S-tog A to Hillerød St.',
      'S-tog E to Køge St.',
    ])
    fireEvent.click(within(section).getByRole('button', { name: 'Show all 6' }))
    expect(trains()).toEqual([
      'Train RE to Næstved St.',
      'S-tog A to Hundige St.',
      'S-tog A to Hillerød St.',
      'S-tog E to Køge St.',
      'S-tog E to Holte St.',
      'S-tog A to Hillerød St.',
    ])
  })

  it('shows 4 with no button when 4 stand', async () => {
    answers.set('48645', standingAt([1, 2, 3, 4].map((n) => standingTrain(n))))
    openStop('en', '?stop=48645')
    const section = standingSection(await panel('Refshaleøen'))
    expect(within(section).getAllByRole('listitem')).toHaveLength(4)
    expect(within(section).queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  })

  it('says so in words when nothing stands at the platforms', async () => {
    openStop('en', '?stop=27532')
    const section = standingSection(await panel('Nørreport St.'))
    expect(section).toHaveTextContent(
      'No vehicle of the types shown is standing at the platforms now.',
    )
    expect(within(section).queryByRole('list')).not.toBeInTheDocument()
  })

  it('leaves out the modes the filters hide', async () => {
    answers.set('48645', standingAt([...REFSHALEOEN.standing, standingTrain(5)]))
    openStop('en', '?stop=48645&hide=bus')
    const section = standingSection(await panel('Refshaleøen'))
    expect(within(section).getAllByRole('listitem')).toHaveLength(1)
    expect(section).toHaveTextContent('Destination 5')
    expect(section).not.toHaveTextContent('Teglholmen')
  })

  it('says the same in Danish', async () => {
    answers.set(
      '48645',
      standingAt([
        ...REFSHALEOEN.standing,
        ...[1, 2, 3, 4].map((n) => standingTrain(n)),
        standingTrain(6, {
          ends: true,
          departs: undefined,
          scheduled: undefined,
          expected: undefined,
        }),
      ]),
    )
    const { unmount } = openStop('da', '?stop=48645')
    const section = standingSection(await panel('Refshaleøen'), 'Ved perronerne nu')
    const [bus] = within(section).getAllByRole('listitem')
    expect(bus).toHaveTextContent('Beregnet')
    fireEvent.click(within(section).getByRole('button', { name: 'Vis alle 6' }))
    expect(within(section).getAllByRole('listitem')[1]).toHaveTextContent('Spor 1')
    expect(within(section).getAllByRole('listitem')[5]).toHaveTextContent('Slutter her')
    expect(within(section).getByRole('button', { name: 'Vis færre' })).toBeInTheDocument()
    unmount()
    act(() => openPanel(undefined))
    openStop('da', '?stop=27532')
    expect(standingSection(await panel('Nørreport St.'), 'Ved perronerne nu')).toHaveTextContent(
      'Intet køretøj af de viste typer holder ved perronerne nu.',
    )
  })
})

/** `answer` with the arrival of `trip` changed by `change`. */
const withArrival = (
  answer: StopArrivals,
  trip: string,
  change: Partial<StopArrival>,
): StopArrivals => ({
  ...answer,
  arrivals: answer.arrivals.map((each) => (each.trip === trip ? { ...each, ...change } : each)),
})

const E_FROM_HOLTE = E_TO_KOGE

/** The stop panel's tabs. */
const tabs = (stop: HTMLElement, name = 'Departures and arrivals') =>
  within(stop).getByRole('tablist', { name })

/** Chooses a tab of the stop panel by its name, and waits for its panel. */
async function choose(stop: HTMLElement, name: string, list = 'Departures and arrivals') {
  fireEvent.click(within(tabs(stop, list)).getByRole('tab', { name }))
  return within(stop).findByRole('tabpanel', { name })
}

describe('the Departures and Arrivals tabs', () => {
  it('open on Departures, with today’s list under it, below the standing trips', async () => {
    openStop('en', '?stop=48645')
    const stop = await panel('Refshaleøen')
    const list = tabs(stop)
    expect(
      within(list)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Departures', 'Arrivals'])
    expect(within(list).getByRole('tab', { name: 'Departures' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const departures = within(stop).getByRole('tabpanel', { name: 'Departures' })
    expect(within(departures).getByRole('list', { name: 'Departures' })).toHaveTextContent(
      'Teglholmen',
    )
    expect(standingSection(stop).compareDocumentPosition(list)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(window.location.search).toBe('?stop=48645')
    // Arrivals are asked for only once their tab opens.
    expect(asked.filter((url) => url.endsWith('/arrivals'))).toEqual([])
  })

  it('list the trips arriving in the next 30 minutes, each from where it comes', async () => {
    openStop('en', '?stop=27532')
    const stop = await panel('Nørreport St.')
    const arrivals = await choose(stop, 'Arrivals')
    expect(window.location.search).toBe('?stop=27532&board=arrivals')
    expect(asked).toContain('/api/stops/27532/arrivals')
    const list = await within(arrivals).findByRole('list', { name: 'Arrivals' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
    // The soonest: line E from Holte, two minutes late, its timetabled time struck.
    const first = within(list).getAllByRole('listitem')[0]
    expect(first).toHaveTextContent('E')
    expect(first).toHaveTextContent('From Holte St.')
    expect(first).not.toHaveTextContent('Køge St.')
    expect(first).toHaveTextContent('Live')
    expect(first).toHaveTextContent('8 min')
    expect(first).toHaveTextContent('+2')
    expect(getComputedStyle(within(first).getByText('07:27')).textDecorationLine).toBe(
      'line-through',
    )
    expect(within(first).getByText('07:29')).toBeInTheDocument()
    // An Estimated arrival's time reads "~".
    const herlev = row(list, 'From Herlev Hospital, Sløjfen')
    expect(herlev).toHaveTextContent('Estimated')
    expect(within(herlev).getByText('07:39')).toHaveTextContent(/^~07:39$/)
    // The departures are gone from view.
    expect(within(stop).queryByRole('list', { name: 'Departures' })).not.toBeInTheDocument()
  })

  it('give an arrival “Now” under 45 s, and a Timetable only one its timetabled time and an unknown delay', async () => {
    arrivalAnswers.set(
      '27532',
      withArrival(NORREPORT_ARRIVALS, E_FROM_HOLTE, {
        scheduled: NORREPORT_ARRIVALS.fetched,
        expected: NORREPORT_ARRIVALS.fetched + 30_000,
      }),
    )
    openStop('en', '?stop=27532&board=arrivals')
    const arrivals = await within(await panel('Nørreport St.')).findByRole('list', {
      name: 'Arrivals',
    })
    expect(row(arrivals, 'From Holte St.')).toHaveTextContent('Now')
    act(() => openPanel({ kind: 'stop', id: '48645' }))
    const refshaleoen = await panel('Refshaleøen')
    const bus = row(
      await within(await choose(refshaleoen, 'Arrivals')).findByRole('list', { name: 'Arrivals' }),
      'From Orientkaj St.',
    )
    expect(bus).toHaveTextContent('Timetable only')
    expect(within(bus).getByText('07:47')).toBeInTheDocument()
    expect(bus).toHaveTextContent('—')
  })

  it('read the Metro’s arrivals as an interval with the note, and no clock time', async () => {
    openStop('en', '?stop=8603313&board=arrivals')
    const stop = await panel('Bella Center St.')
    const list = await within(stop).findByRole('list', { name: 'Arrivals' })
    const metro = row(list, 'From Vanløse St.')
    expect(metro).toHaveTextContent('M1')
    expect(metro).toHaveTextContent('Every 4 min')
    expect(metro).toHaveTextContent('Metro: planned times')
    expect(metro).not.toHaveTextContent(/\d\d:\d\d/)
    expect(metro.querySelector('time')).toBeNull()
  })

  it('say so when nothing arrives, and where the times came from', async () => {
    openStop('en', '?stop=8600683&board=arrivals')
    const stop = await panel('Hillerød St.')
    const arrivals = within(stop).getByRole('tabpanel', { name: 'Arrivals' })
    expect(
      await within(arrivals).findByText(
        'No arrivals in the next 30 minutes for the vehicle types shown.',
      ),
    ).toBeInTheDocument()
    expect(arrivals).toHaveTextContent('From the timetable')
    expect(arrivals).toHaveTextContent('Timetable and positions 07:21:00')
    // The note says where these times come from: no arrival board was asked.
    expect(arrivals).toHaveTextContent(
      'Countdowns use the timetable, moved by the delay the positions show where a trip has one; the rest use the timetable alone, and say so.',
    )
    expect(arrivals).not.toHaveTextContent('Rejseplanen')
  })

  it('give an arrival board’s answer the departures’ note, of Rejseplanen’s expected times', async () => {
    arrivalAnswers.set('27532', {
      ...NORREPORT_ARRIVALS,
      source: { kind: 'rejseplanen', at: NORREPORT_ARRIVALS.fetched },
    })
    openStop('en', '?stop=27532&board=arrivals')
    const arrivals = within(await panel('Nørreport St.')).getByRole('tabpanel', {
      name: 'Arrivals',
    })
    expect(
      await within(arrivals).findByText(
        "Countdowns use Rejseplanen's expected times where it has them; the rest use the timetable, and say so.",
      ),
    ).toBeInTheDocument()
  })

  it('keep a cancelled arrival, marked Cancelled with its countdown struck', async () => {
    arrivalAnswers.set('27532', withArrival(NORREPORT_ARRIVALS, E_FROM_HOLTE, { cancelled: true }))
    openStop('en', '?stop=27532&board=arrivals')
    const list = await within(await panel('Nørreport St.')).findByRole('list', {
      name: 'Arrivals',
    })
    const holte = row(list, 'From Holte St.')
    expect(holte).toHaveTextContent('Cancelled')
    expect(holte).not.toHaveTextContent('Live')
    // The countdown's figure sits in the countdown, which the row strikes.
    const countdown = within(holte).getByText('8').parentElement!
    expect(getComputedStyle(countdown).textDecorationLine).toBe('line-through')
    // Its timetabled time, struck, and not the expected one it won't keep.
    expect(getComputedStyle(within(holte).getByText('07:27')).textDecorationLine).toBe(
      'line-through',
    )
    expect(within(holte).queryByText('07:29')).not.toBeInTheDocument()
    // It stays in the list.
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
  })

  it('name Rejseplanen and the time of its call, and give each arrival the board’s track', async () => {
    // 07:21:20 in Copenhagen.
    arrivalAnswers.set('27532', {
      ...withArrival(NORREPORT_ARRIVALS, E_FROM_HOLTE, { track: '4' }),
      source: { kind: 'rejseplanen', at: NORREPORT_ARRIVALS.fetched + 20_000 },
    })
    openStop('en', '?stop=27532&board=arrivals')
    const arrivals = within(await panel('Nørreport St.')).getByRole('tabpanel', {
      name: 'Arrivals',
    })
    const list = await within(arrivals).findByRole('list', { name: 'Arrivals' })
    expect(row(list, 'From Holte St.')).toHaveTextContent('Track 4')
    expect(arrivals).toHaveTextContent('Rejseplanen · arrivals 07:21:20')
    expect(arrivals).not.toHaveTextContent('From the timetable')
    expect(arrivals).not.toHaveTextContent('Timetable and positions')
  })

  it('leave out the modes the filters hide', async () => {
    openStop('en', '?stop=27532&board=arrivals&hide=s-tog')
    const stop = await panel('Nørreport St.')
    const list = await within(stop).findByRole('list', { name: 'Arrivals' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(list).not.toHaveTextContent('Holte St.')
  })

  it('show each list’s own messages under its own tab', async () => {
    answers.set('27532', { ...NORREPORT, messages: [WORKS] })
    arrivalAnswers.set('27532', { ...NORREPORT_ARRIVALS, messages: [CLOSED] })
    openStop('en', '?stop=27532')
    const stop = await panel('Nørreport St.')
    const departures = within(stop).getByRole('tabpanel', { name: 'Departures' })
    expect(departures).toHaveTextContent('Sporarbejde ved Nørreport')
    const arrivals = await choose(stop, 'Arrivals')
    const cards = await within(arrivals).findByRole('region', { name: 'Messages' })
    expect(cards).toHaveTextContent('Nørreport lukket for busser')
    expect(cards).not.toHaveTextContent('Sporarbejde ved Nørreport')
  })

  it('open an arrival’s trip, in place of the stop', async () => {
    openStop('en', '?stop=27532&board=arrivals&hide=train')
    const list = await within(await panel('Nørreport St.')).findByRole('list', { name: 'Arrivals' })
    fireEvent.click(
      within(row(list, 'From Holte St.')).getByRole('button', { name: 'S-tog E from Holte St.' }),
    )
    expect(window.location.search).toBe(`?hide=train&trip=${E_FROM_HOLTE}`)
  })

  it('name an arrival’s button for where it comes from, as its row reads', async () => {
    openStop('en', '?stop=48645&board=arrivals')
    const list = await within(await panel('Refshaleøen')).findByRole('list', { name: 'Arrivals' })
    const bus = row(list, 'From Orientkaj St.')
    expect(within(bus).getByRole('button')).toHaveAccessibleName('Bus 991 from Orientkaj St.')
  })

  it('move between the tabs with the arrow keys, and go back to Departures in the address', async () => {
    openStop('en', '?stop=27532&board=arrivals')
    const stop = await panel('Nørreport St.')
    const arrivals = within(tabs(stop)).getByRole('tab', { name: 'Arrivals' })
    expect(arrivals).toHaveAttribute('aria-selected', 'true')
    const user = userEvent.setup()
    act(() => arrivals.focus())
    await user.keyboard('{ArrowLeft}')
    const departures = within(tabs(stop)).getByRole('tab', { name: 'Departures' })
    expect(departures).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(arrivals).toHaveFocus()
    fireEvent.click(departures)
    expect(window.location.search).toBe('?stop=27532')
    expect(within(stop).getByRole('tabpanel', { name: 'Departures' })).toBeInTheDocument()
  })

  it('say the same in Danish', async () => {
    openStop('da', '?stop=27532')
    const stop = await panel('Nørreport St.')
    const list = tabs(stop, 'Afgange og ankomster')
    expect(
      within(list)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Afgange', 'Ankomster'])
    const arrivals = await choose(stop, 'Ankomster', 'Afgange og ankomster')
    const rows = await within(arrivals).findByRole('list', { name: 'Ankomster' })
    const first = within(rows).getAllByRole('listitem')[0]
    expect(first).toHaveTextContent('Fra Holte St.')
    expect(row(rows, 'Fra Herlev Hospital, Sløjfen')).toHaveTextContent('Beregnet')
    expect(within(first).getByRole('button')).toHaveAccessibleName('S-tog E fra Holte St.')
    expect(arrivals).toHaveTextContent('Køreplan og positioner 07:21:00')
    expect(arrivals).toHaveTextContent(
      'Nedtællinger bruger køreplanen, rykket med den forsinkelse, positionerne viser, hvor en tur har en; resten bruger køreplanen alene og siger det.',
    )
    act(() => openPanel({ kind: 'stop', id: '8603313' }))
    const bellaCenter = await panel('Bella Center St.')
    const metro = row(
      await within(await choose(bellaCenter, 'Ankomster', 'Afgange og ankomster')).findByRole(
        'list',
        { name: 'Ankomster' },
      ),
      'Fra Vanløse St.',
    )
    expect(metro).toHaveTextContent('Hvert 4. min')
    act(() => openPanel({ kind: 'stop', id: '8600683' }))
    const hillerod = await panel('Hillerød St.')
    expect(
      await within(await choose(hillerod, 'Ankomster', 'Afgange og ankomster')).findByText(
        'Ingen ankomster de næste 30 minutter for de viste transportformer.',
      ),
    ).toBeInTheDocument()
  })
})

describe('a stop opened by link before the page’s clock settles', () => {
  // This device's clock runs a day ahead of the server's, and no snapshot has landed yet to say
  // by how much: a row read by it would say "Now", and a board answer "may be out of date".
  const AHEAD = 24 * HOUR

  /**
   * Opens `search` on a page as it first paints, its modules loaded afresh so that no snapshot has
   * landed; returns the page's live store, whose update stands in for the first one landing.
   */
  async function openFresh(search: string) {
    vi.setSystemTime(NORREPORT.fetched + AHEAD)
    vi.resetModules()
    const [{ MapScreen: Screen }, { Providers: Fresh }, live] = await Promise.all([
      import('./MapScreen'),
      import('./Providers'),
      import('../map/live'),
    ])
    window.history.replaceState(null, '', `/en${search}`)
    const { unmount } = render(
      <Fresh lang="en" dictionary={en}>
        <Screen />
      </Fresh>,
    )
    const settle = () => act(() => live.liveSnapshot.update({ clockOffset: -AHEAD }))
    return { settle, unmount }
  }

  /** The countdowns of `list`'s rows, as they read. */
  const countdowns = (list: HTMLElement) =>
    [...list.querySelectorAll('.pn-DepartureRow-countdown')].map((each) => each.textContent)

  it('shows Departures with no countdown and a fresh source line until it settles', async () => {
    answers.set('27532', { ...fromBoard(NORREPORT), messages: [CLOSED] })
    const { settle, unmount } = await openFresh('?stop=27532')
    const stop = await panel('Nørreport St.')
    const departures = within(stop).getByRole('list', { name: 'Departures' })
    expect(countdowns(departures)).toEqual(Array(10).fill('—Unknown'))
    expect(within(departures).getByText('07:29')).toBeInTheDocument()
    expect(stop).toHaveTextContent('Rejseplanen · departures 07:21:00')
    expect(stop).not.toHaveTextContent('may be out of date')
    // The stop's messages read as at the moment of its answer.
    expect(within(stop).getByRole('region', { name: 'Messages' })).toHaveTextContent(
      'Nørreport lukket for busser',
    )
    settle()
    expect(countdowns(departures)[0]).toBe('8 min')
    expect(countdowns(departures)).not.toContain('—Unknown')
    unmount()
  })

  it('shows a standing trip with no countdown until it settles', async () => {
    const { settle, unmount } = await openFresh('?stop=48645')
    const section = standingSection(await panel('Refshaleøen'))
    expect(countdowns(section)).toEqual(['—Unknown'])
    expect(within(section).getByText('07:23')).toBeInTheDocument()
    settle()
    expect(countdowns(section)).toEqual(['~2 min'])
    unmount()
  })

  it('shows Arrivals with no countdown and a fresh source line until it settles', async () => {
    arrivalAnswers.set('27532', {
      ...NORREPORT_ARRIVALS,
      source: { kind: 'rejseplanen', at: NORREPORT_ARRIVALS.fetched },
    })
    const { settle, unmount } = await openFresh('?stop=27532&board=arrivals')
    const stop = await panel('Nørreport St.')
    const arrivals = await within(stop).findByRole('list', { name: 'Arrivals' })
    expect(countdowns(arrivals)).toEqual(Array(10).fill('—Unknown'))
    expect(stop).toHaveTextContent('Rejseplanen · arrivals 07:21:00')
    expect(stop).not.toHaveTextContent('may be out of date')
    settle()
    expect(countdowns(arrivals)[0]).toBe('8 min')
    unmount()
  })
})

describe('the trips standing at a stop’s platforms, on a phone', () => {
  beforeEach(() => {
    phone = true
  })

  it('shows every one in the row, with no Show all', async () => {
    answers.set('48645', standingAt([1, 2, 3, 4, 5, 6].map((n) => standingTrain(n))))
    openStop('en', '?stop=48645')
    const section = standingSection(await panel('Refshaleøen'))
    expect(
      within(section)
        .getAllByRole('listitem')
        .map((each) => /Destination \d/.exec(each.textContent ?? '')?.[0]),
    ).toEqual([1, 2, 3, 4, 5, 6].map((n) => `Destination ${n}`))
    expect(within(section).queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  })

  it('gives each its line, destination, track, time and data state, above the tabs', async () => {
    answers.set('48645', standingAt([...REFSHALEOEN.standing, standingTrain(5)]))
    openStop('en', '?stop=48645')
    const stop = await panel('Refshaleøen')
    const section = standingSection(stop)
    const [bus, train] = within(section).getAllByRole('listitem')
    expect(bus).toHaveTextContent('991')
    expect(bus).toHaveTextContent('Teglholmen')
    expect(bus).toHaveTextContent('Estimated')
    expect(bus).toHaveTextContent('2 min')
    expect(within(bus).getByText('07:23')).toHaveTextContent(/^~07:23$/)
    expect(train).toHaveTextContent('Destination 5')
    expect(train).toHaveTextContent('Track 5')
    expect(train).toHaveTextContent('Live')
    expect(train).toHaveTextContent('07:26')
    expect(section.compareDocumentPosition(tabs(stop))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('opens a standing trip’s vehicle, in place of the stop', async () => {
    openStop('en', '?stop=48645')
    const section = standingSection(await panel('Refshaleøen'))
    fireEvent.click(within(section).getByRole('button', { name: 'Bus 991 to Teglholmen' }))
    expect(window.location.search).toBe(`?trip=${BUS_991}`)
  })

  it('says so in words when nothing stands at the platforms', async () => {
    openStop('en', '?stop=27532')
    const section = standingSection(await panel('Nørreport St.'))
    expect(section).toHaveTextContent(
      'No vehicle of the types shown is standing at the platforms now.',
    )
    expect(within(section).queryByRole('list')).not.toBeInTheDocument()
  })

  it('names the row for the section, and the keyboard reaches each trip in it, in order', async () => {
    answers.set('48645', standingAt([1, 2, 3].map((n) => standingTrain(n))))
    openStop('en', '?stop=48645')
    const section = standingSection(await panel('Refshaleøen'))
    expect(within(section).getByRole('list', { name: 'At the platforms now' })).toBeInTheDocument()
    const buttons = within(section).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(
      [1, 2, 3].map((n) => `S-tog A to Destination ${n}`),
    )
    act(() => buttons[0].focus())
    const user = userEvent.setup()
    await user.tab()
    expect(buttons[1]).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(window.location.search).toBe('?trip=s-tog.A.standing2.20260616.0700')
  })

  it('says the same in Danish', async () => {
    answers.set('48645', standingAt([...REFSHALEOEN.standing, standingTrain(5)]))
    const { unmount } = openStop('da', '?stop=48645')
    const section = standingSection(await panel('Refshaleøen'), 'Ved perronerne nu')
    expect(within(section).getByRole('list', { name: 'Ved perronerne nu' })).toBeInTheDocument()
    const [bus, train] = within(section).getAllByRole('listitem')
    expect(bus).toHaveTextContent('Beregnet')
    expect(train).toHaveTextContent('Spor 5')
    unmount()
    act(() => openPanel(undefined))
    openStop('da', '?stop=27532')
    expect(standingSection(await panel('Nørreport St.'), 'Ved perronerne nu')).toHaveTextContent(
      'Intet køretøj af de viste typer holder ved perronerne nu.',
    )
  })
})
