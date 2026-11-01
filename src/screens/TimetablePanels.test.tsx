import '@mylder/perron/tokens.css'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { followedVehicle } from '../map/follow'
import { liveSnapshot } from '../map/live'
import { openPanel } from '../map/view'
import { timetableRoutes } from '../test/timetableRoutes'
import type { Snapshot, StopArrivals, StopDepartures, TripDetail } from '../tracker/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// The vehicle and stop panels on the timetable source (docs/screens.md, "Vehicle detail" and "Stop
// panel"): the tracker's run with no calls, saved in recordings/timetable-source, its second
// minute, 07:21:00 in Copenhagen, and the trip, stop and arrivals answers saved then. Every trip is
// Timetable only, and nothing on either panel names Rejseplanen's realtime. jsdom has no server:
// the routes answer from those files.
const folder = join(process.cwd(), 'recordings', 'timetable-source')
const read = (path: string): unknown => JSON.parse(readFileSync(join(folder, path), 'utf8'))

/** Fetched at 07:21:00, the saved answers' minute. */
const minute2 = read('snapshots/0002.json') as Snapshot

/** Bus 5C to Husum Torv, underway on its planned times. */
const BUS = 'bus.5C.32331e0e20.20260616.0707'
/** Line A to Hillerød St., underway on its planned times. */
const A = 's-tog.A.0bc307e3eb.20260616.0707'
/** M1 to Vestamager, on its interval. */
const M1 = 'metro.M1.7f21f99145.20260616.0707'

const trips = new Map(
  [BUS, A, M1].map((key) => [key, read(`answers/trips/${key}.json`) as TripDetail] as const),
)
const stops = new Map(
  ['27532', '54307', '8603313'].map(
    (id) => [id, read(`answers/stops/${id}.json`) as StopDepartures] as const,
  ),
)
const arrivals = new Map(
  ['27532', '8603313'].map(
    (id) => [id, read(`answers/arrivals/${id}.json`) as StopArrivals] as const,
  ),
)

/** The trip, stop and arrivals routes from the saved answers, and the timetable's routes. */
const routes = async (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input)
  const [, key] = /^\/api\/trips\/([^/]+)$/.exec(url) ?? []
  const [, id, arrives] = /^\/api\/stops\/([^/]+)(\/arrivals)?$/.exec(url) ?? []
  const answer =
    key !== undefined
      ? trips.get(decodeURIComponent(key))
      : id !== undefined
        ? (arrives ? arrivals : stops).get(decodeURIComponent(id))
        : undefined
  if (answer) return Response.json(answer)
  if (key !== undefined || id !== undefined) return Response.json({}, { status: 404 })
  return timetableRoutes(input)
}

/** Opens the page in `lang` at `search` on the saved minute, the server's clock at its fetch. */
function open(lang: Lang, search: string) {
  vi.setSystemTime(minute2.fetched)
  act(() => liveSnapshot.update({ snapshot: minute2, clockOffset: 0 }))
  window.history.replaceState(null, '', `/${lang}${search}`)
  return render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )
}

/** The open panel named `name`, once its text holds `words`, which may span its parts. */
async function panel(name: string | RegExp, words: string) {
  const found = await screen.findByRole('dialog', { name })
  await waitFor(() => expect(found).toHaveTextContent(words))
  return found
}

/** The value of the fact named `label`. */
const fact = (within_: HTMLElement, label: string) =>
  within(within_).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement

/** The row of `list` that names `place`, the first if several do. */
const row = (list: HTMLElement, place: string) =>
  within(list)
    .getAllByRole('listitem')
    .find((each) => each.textContent?.includes(place))!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.stubGlobal('fetch', routes)
})

afterEach(() => {
  act(() => openPanel(undefined))
  act(() => followedVehicle.stop())
  act(() => liveSnapshot.update({ snapshot: undefined }))
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("a vehicle's detail on the timetable", () => {
  it('lists its stops at their planned times, with no delay and no expected time', async () => {
    open('en', `?trip=${A}`)
    const trip = await panel(/to Hillerød St\./, 'Timetable · placed 07:21:00')
    expect(trip).toHaveTextContent('Timetable only')
    expect(fact(trip, 'Delay')).toHaveTextContent('—')
    expect(fact(trip, 'Last seen')).toHaveTextContent('—')
    const items = within(within(trip).getByRole('list', { name: 'Stops' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Hundige St.')
    expect(items[0]).toHaveTextContent('07:07')
    expect(items[1]).toHaveTextContent('07:09')
    for (const item of items) {
      expect(item).not.toHaveTextContent('~')
      expect(item).not.toHaveTextContent(/[+−]\d/)
    }
  })

  it('says it is placed from the timetable, with no live positions yet', async () => {
    open('en', `?trip=${BUS}`)
    const trip = await panel(/to Husum Torv/, 'Timetable · placed 07:21:00')
    expect(trip).toHaveTextContent('No live positions yet; placed from the timetable.')
    expect(trip).not.toHaveTextContent('No realtime for this trip today')
    expect(trip).not.toHaveTextContent('Rejseplanen')
    expect(trip).not.toHaveTextContent('position 07')
    expect(trip).not.toHaveTextContent('times from the timetable')
    expect(trip).not.toHaveTextContent('updated')
  })

  it('keeps a Metro trip on its interval, its stops without times', async () => {
    open('en', `?trip=${M1}`)
    const trip = await panel(/to Vestamager St\./, 'Every 4 min')
    expect(fact(trip, 'Delay')).toHaveTextContent('Runs to an interval')
    expect(within(trip).getByRole('list', { name: 'Stops' })).not.toHaveTextContent(/\d\d:\d\d/)
    expect(trip).toHaveTextContent('Timetable · placed 07:21:00')
  })

  it('follows the vehicle as on any other source', async () => {
    open('en', `?trip=${BUS}`)
    const trip = await panel(/to Husum Torv/, 'Timetable · placed 07:21:00')
    const follow = within(trip).getByRole('button', { name: 'Follow' })
    expect(follow).toBeEnabled()
    fireEvent.click(follow)
    expect(follow).toHaveAttribute('aria-pressed', 'true')
    expect(followedVehicle.get()).toBe(BUS)
  })

  it('says the same in Danish', async () => {
    open('da', `?trip=${A}`)
    const trip = await panel(/mod Hillerød St\./, 'Køreplan · placeret 07:21:00')
    expect(trip).toHaveTextContent('Ingen livepositioner endnu; placeret efter køreplanen.')
    expect(fact(trip, 'Forsinkelse')).toHaveTextContent('—')
    const items = within(within(trip).getByRole('list', { name: 'Stop' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('07:07')
    expect(items[0]).not.toHaveTextContent('~')
    expect(trip).not.toHaveTextContent('Rejseplanen')
  })
})

describe("a stop's departures on the timetable", () => {
  it('lists each at its planned time, the delay unknown, and says the times are the timetable’s', async () => {
    open('en', '?stop=27532')
    const stop = await panel('Nørreport St.', 'Timetable · 07:21:00')
    const departures = within(stop).getByRole('list', { name: 'Departures' })
    const husum = row(departures, 'Husum Torv')
    expect(husum).toHaveTextContent('Timetable only')
    // Its planned time, never an expected one marked "~", and no delay.
    expect(within(husum).getByText('07:36')).toHaveTextContent(/^07:36$/)
    expect(husum).toHaveTextContent('—')
    expect(departures).not.toHaveTextContent(/[+−]\d/)
    expect(stop).toHaveTextContent(
      "Countdowns use the timetable alone; live times aren't connected yet.",
    )
    expect(stop).not.toHaveTextContent('Rejseplanen')
    expect(stop).not.toHaveTextContent('Timetable and positions')
    expect(stop).not.toHaveTextContent('From the timetable')
  })

  it('gives a bus Waiting at its first stop its planned time', async () => {
    open('en', '?stop=54307')
    const stop = await panel('Orientkaj St.', 'Timetable · 07:21:00')
    const teglholmen = row(within(stop).getByRole('list', { name: 'Departures' }), 'Teglholmen')
    expect(within(teglholmen).getByText('07:30')).toBeInTheDocument()
    expect(teglholmen).toHaveTextContent('—')
  })

  it('keeps a Metro platform on its interval', async () => {
    open('en', '?stop=8603313')
    const stop = await panel('Bella Center St.', 'Timetable · 07:21:00')
    const metro = row(within(stop).getByRole('list', { name: 'Departures' }), 'Vestamager')
    expect(metro).toHaveTextContent('Every 4 min')
    expect(metro).toHaveTextContent('Metro: planned times')
    expect(metro).not.toHaveTextContent(/\d\d:\d\d/)
  })

  it('says the same of its arrivals', async () => {
    open('en', '?stop=27532&board=arrivals')
    const stop = await panel('Nørreport St.', 'Timetable · 07:21:00')
    const list = await within(stop).findByRole('list', { name: 'Arrivals' })
    const holte = row(list, 'From Holte St.')
    expect(holte).toHaveTextContent('Timetable only')
    expect(within(holte).getByText('07:27')).toHaveTextContent(/^07:27$/)
    expect(holte).toHaveTextContent('—')
    const tab = within(stop).getByRole('tabpanel', { name: 'Arrivals' })
    expect(tab).toHaveTextContent(
      "Countdowns use the timetable alone; live times aren't connected yet.",
    )
    expect(tab).toHaveTextContent('Timetable · 07:21:00')
    expect(tab).not.toHaveTextContent('positions')
    expect(tab).not.toHaveTextContent('From the timetable')
  })

  it('says the same in Danish', async () => {
    open('da', '?stop=27532')
    const stop = await panel('Nørreport St.', 'Køreplan · 07:21:00')
    const husum = row(within(stop).getByRole('list', { name: 'Afgange' }), 'Husum Torv')
    expect(husum).toHaveTextContent('Kun køreplan')
    expect(within(husum).getByText('07:36')).toHaveTextContent(/^07:36$/)
    expect(husum).toHaveTextContent('—')
    expect(stop).toHaveTextContent(
      'Nedtællinger bruger kun køreplanen; realtiden er ikke koblet på endnu.',
    )
    expect(stop).not.toHaveTextContent('Rejseplanen')
    expect(stop).not.toHaveTextContent('Køreplan og positioner')
    expect(stop).not.toHaveTextContent('Fra køreplanen')
  })

  it('keeps a Metro platform on its interval, in Danish', async () => {
    open('da', '?stop=8603313')
    const stop = await panel('Bella Center St.', 'Køreplan · 07:21:00')
    const metro = row(within(stop).getByRole('list', { name: 'Afgange' }), 'Vestamager')
    expect(metro).toHaveTextContent('Hvert 4. min')
    expect(metro).toHaveTextContent('Metro: planlagte tider')
  })
})
