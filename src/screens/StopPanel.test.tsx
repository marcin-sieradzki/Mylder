import '@mylder/perron/tokens.css'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { mapView, openPanel } from '../map/view'
import type { StopDeparture, StopDepartures } from '../tracker/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// A stop's departures panel from the stop route's answers saved with the weekday recording, at
// the start of its second minute, 07:21:00 in Copenhagen. jsdom has no server: the route answers
// from those files, and a test changes one where the recording shows no such case.
const saved = (stop: string): StopDepartures =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'recordings', 'weekday', 'answers', 'stops', `${stop}.json`),
      'utf8',
    ),
  ) as StopDepartures

/** Nørreport St.: Live and Estimated departures by bus and S-tog. */
const NORREPORT = saved('27532')
/** Orientkaj St.: one Timetable only bus. */
const ORIENTKAJ = saved('54307')
/** Hillerød St.: none in the next 30 minutes. */
const HILLEROD = saved('8600683')

/** The stop route's answers by stop id; a stop missing here is a 404. */
let answers: Map<string, StopDepartures>

const routes = async (input: RequestInfo | URL): Promise<Response> => {
  const [, id] = /^\/api\/stops\/([^/]+)$/.exec(String(input)) ?? []
  const answer = id === undefined ? undefined : answers.get(decodeURIComponent(id))
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

beforeEach(() => {
  // The server's clock reads the answers' moment; this device's is the server's.
  vi.useFakeTimers({ toFake: ['Date'], now: NORREPORT.fetched })
  answers = new Map([
    ['27532', NORREPORT],
    ['54307', ORIENTKAJ],
    ['8600683', HILLEROD],
  ])
  vi.stubGlobal('fetch', routes)
})

afterEach(() => {
  act(() => openPanel(undefined))
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
    expect(within(husum).getByText('~07:38')).toBeInTheDocument()
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
    expect(within(stop).getByRole('list', { name: 'Departures' }).children).toHaveLength(10)
  })

  it('gives a Timetable only departure its timetabled time and no delay', async () => {
    openStop('en', '?stop=54307')
    const teglholmen = row(await panel('Orientkaj St.'), 'Teglholmen')
    expect(teglholmen).toHaveTextContent('Timetable only')
    expect(within(teglholmen).getByText('07:30')).toBeInTheDocument()
    expect(teglholmen).toHaveTextContent('—')
  })

  it('says Unknown beside a No signal departure’s timetabled time', async () => {
    answers.set('27532', withRow(NORREPORT, BUS_TO_HUSUM, { state: 'no-signal' }))
    openStop('en', '?stop=27532')
    const husum = row(await panel('Nørreport St.'), 'Husum Torv')
    expect(husum).toHaveTextContent('No signal')
    expect(within(husum).getByText('07:36')).toBeInTheDocument()
    expect(husum).toHaveTextContent('Unknown')
    expect(within(husum).queryByText('~07:38')).not.toBeInTheDocument()
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
    expect(stop).toHaveTextContent('Timetable and positions · updated 07:21:00')
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
    expect(within(husum).getByText('~07:38')).toBeInTheDocument()
    expect(stop).toHaveTextContent('Fra køreplanen')
    expect(stop).toHaveTextContent('Køreplan og positioner · opdateret 07:21:00')
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
