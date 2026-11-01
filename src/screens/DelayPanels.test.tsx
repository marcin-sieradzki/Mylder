import '@mylder/perron/tokens.css'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { followedVehicle } from '../map/follow'
import { liveSnapshot } from '../map/live'
import { openPanel } from '../map/view'
import { timetableRoutesOf } from '../test/timetableRoutes'
import type { Snapshot, StopArrivals, StopDepartures, TripDetail } from '../tracker/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// SIRI-ET's delays in the vehicle and stop panels (docs/screens.md, "Vehicle detail" and "Stop
// panel"; spec #146, #214): the timetable source with `MYLDER_UPDATES=recording:siri-et`, saved in
// recordings/siri-et, its second minute, 09:22:00 in Copenhagen on Saturday 31 October 2026, and
// the trip, stop and arrivals answers saved then. A trip with an update is Estimated, its times
// marked "~"; one without stays Timetable only. jsdom has no server: the routes answer from those
// files.
const folder = join(process.cwd(), 'recordings', 'siri-et')
const read = (path: string): unknown => JSON.parse(readFileSync(join(folder, path), 'utf8'))

/** Fetched at 09:22:00, the saved answers' minute; the delays' last message came at 09:21:52. */
const minute2 = read('snapshots/0002.json') as Snapshot

/** Bus 2A to Refshaleøen, 6 min late at its next stop, Falkoner Allé; updated 09:21:43. */
const LATE = 'bus.2A.643c65fb6f.20261031.0857'
/** Bus 4A to Buddinge St., 4 min early at its next stop, Hillerødgade; updated 09:21:43. */
const EARLY = 'bus.4A.a47257f88b.20261031.0900'
/** Bus 68 to Lyngby St., which skips Otto Mønsteds Plads at 09:32; updated 09:21:41. */
const SKIPS = 'bus.68.bb4e5908a5.20261031.0916'

const trips = new Map(
  [LATE, EARLY, SKIPS].map(
    (key) => [key, read(`answers/trips/${key}.json`) as TripDetail] as const,
  ),
)
const stops = new Map(
  ['6584', '30090', '5344'].map(
    (id) => [id, read(`answers/stops/${id}.json`) as StopDepartures] as const,
  ),
)
const arrivals = new Map([['6584', read('answers/arrivals/6584.json') as StopArrivals]])

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
  return timetableRoutesOf('siri-et')(input)
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

/** The item of `list` that holds each of `words`, such as a line and a place, the first if several do. */
const row = (list: HTMLElement, ...words: string[]) =>
  within(list)
    .getAllByRole('listitem')
    .find((each) => words.every((word) => each.textContent?.includes(word)))!

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

describe("a vehicle's detail with SIRI-ET's delays", () => {
  it('gives a late trip’s delay at its next stop, and its stops’ expected times marked "~"', async () => {
    open('en', `?trip=${LATE}`)
    const trip = await panel(/to Refshaleøen/, "Timetable and Rejseplanen's delays")
    expect(trip).toHaveTextContent('Estimated from the timetable and a delay of +6 min')
    expect(fact(trip, 'Delay')).toHaveTextContent('+6 min')
    expect(fact(trip, 'Delay')).toHaveTextContent('6 min late')
    expect(fact(trip, 'Next stop')).toHaveTextContent('Falkoner Allé (Rolighedsvej)')
    const calls = within(trip).getByRole('list', { name: 'Stops' })
    const falkoner = row(calls, 'Falkoner Allé (Rolighedsvej)')
    // Planned at 09:17, expected at 09:23.
    expect(falkoner).toHaveTextContent('09:17')
    expect(falkoner).toHaveTextContent('~09:23')
    expect(falkoner).toHaveTextContent('Expected 09:23')
  })

  it('says its times are the timetable’s and Rejseplanen’s delays, with its latest update', async () => {
    open('en', `?trip=${LATE}`)
    const trip = await panel(/to Refshaleøen/, "Timetable and Rejseplanen's delays")
    expect(trip).toHaveTextContent("Timetable and Rejseplanen's delays · updated 09:21:43")
    expect(trip).not.toHaveTextContent('placed 09')
    expect(trip).not.toHaveTextContent('No live positions yet')
  })

  it('shows an early trip as early', async () => {
    open('en', `?trip=${EARLY}`)
    const trip = await panel(/to Buddinge St\./, "Timetable and Rejseplanen's delays")
    expect(trip).toHaveTextContent('Estimated from the timetable and a delay of −4 min')
    expect(fact(trip, 'Delay')).toHaveTextContent('−4 min')
    expect(fact(trip, 'Delay')).toHaveTextContent('4 min early')
    const hilleroedgade = row(
      within(trip).getByRole('list', { name: 'Stops' }),
      'Hillerødgade (Lundtoftegade)',
    )
    expect(hilleroedgade).toHaveTextContent('09:27')
    expect(hilleroedgade).toHaveTextContent('~09:23')
  })

  it('marks the stop a trip skips Cancelled, and keeps the rest', async () => {
    open('en', `?trip=${SKIPS}`)
    const trip = await panel(/to Lyngby St\./, "Timetable and Rejseplanen's delays")
    const calls = within(trip).getByRole('list', { name: 'Stops' })
    const skipped = row(calls, 'Otto Mønsteds Plads (Rysensteensgade)')
    expect(skipped).toHaveTextContent('Cancelled')
    expect(skipped).toHaveAttribute('data-cancelled')
    const cancelled = within(calls)
      .getAllByRole('listitem')
      .filter((each) => each.hasAttribute('data-cancelled'))
    expect(cancelled).toEqual([skipped])
    expect(trip).not.toHaveTextContent(/^Cancelled/)
    expect(trip).toHaveTextContent("Timetable and Rejseplanen's delays · updated 09:21:41")
  })

  it('says the same in Danish', async () => {
    open('da', `?trip=${LATE}`)
    const trip = await panel(/mod Refshaleøen/, 'Køreplan og Rejseplanens forsinkelser')
    expect(trip).toHaveTextContent('Beregnet ud fra køreplanen og en forsinkelse på +6 min')
    expect(fact(trip, 'Forsinkelse')).toHaveTextContent('6 min forsinket')
    const falkoner = row(
      within(trip).getByRole('list', { name: 'Stop' }),
      'Falkoner Allé (Rolighedsvej)',
    )
    expect(falkoner).toHaveTextContent('~09:23')
    expect(falkoner).toHaveTextContent('Forventet 09:23')
    expect(trip).toHaveTextContent('Køreplan og Rejseplanens forsinkelser · opdateret 09:21:43')
  })

  it('says an early trip and a skipped stop in Danish', async () => {
    open('da', `?trip=${EARLY}`)
    const early = await panel(/mod Buddinge St\./, 'Køreplan og Rejseplanens forsinkelser')
    expect(fact(early, 'Forsinkelse')).toHaveTextContent('4 min før tid')
    act(() => openPanel({ kind: 'trip', id: SKIPS }))
    const skips = await panel(/mod Lyngby St\./, 'Køreplan og Rejseplanens forsinkelser')
    const skipped = row(
      within(skips).getByRole('list', { name: 'Stop' }),
      'Otto Mønsteds Plads (Rysensteensgade)',
    )
    expect(skipped).toHaveTextContent('Aflyst')
  })
})

describe("a stop's departures with SIRI-ET's delays", () => {
  it('gives updated trips their expected time marked "~", and the rest "—"', async () => {
    open('en', '?stop=6584')
    const stop = await panel('Nørreport St.', "Timetable and Rejseplanen's delays")
    const departures = within(stop).getByRole('list', { name: 'Departures' })
    // Line C to Klampenborg St., planned at 09:22 and expected a minute late.
    const klampenborg = row(departures, 'Klampenborg St.')
    expect(klampenborg).toHaveTextContent('Estimated')
    expect(klampenborg).toHaveTextContent('~09:23')
    expect(klampenborg).toHaveTextContent('+1 min')
    // Bus 804 to Båstad, with no update: its planned time and the delay unknown.
    const baastad = row(departures, 'Båstad')
    expect(baastad).toHaveTextContent('Timetable only')
    expect(within(baastad).getByText('09:23')).toHaveTextContent(/^09:23$/)
    expect(baastad).toHaveTextContent('—')
    expect(baastad).not.toHaveTextContent(/~\d\d:\d\d/)
  })

  it('keeps the Metro on its interval', async () => {
    open('en', '?stop=6584')
    const stop = await panel('Nørreport St.', "Timetable and Rejseplanen's delays")
    const metro = row(within(stop).getByRole('list', { name: 'Departures' }), 'Metro: planned')
    expect(metro).toHaveTextContent(/Every \d/)
    expect(metro).not.toHaveTextContent(/\d\d:\d\d/)
  })

  it('names the delays’ last update in the note and the source line', async () => {
    open('en', '?stop=6584')
    const stop = await panel('Nørreport St.', "Timetable and Rejseplanen's delays")
    expect(stop).toHaveTextContent(
      "Countdowns use the timetable, moved by Rejseplanen's delay where a trip has one; the rest use the timetable alone.",
    )
    expect(stop).toHaveTextContent("Timetable and Rejseplanen's delays · updated 09:21:52")
    expect(stop).not.toHaveTextContent("live times aren't connected yet")
    expect(stop).not.toHaveTextContent('Timetable · 09:22:00')
  })

  it('says the same of its arrivals', async () => {
    open('en', '?stop=6584&board=arrivals')
    const stop = await panel('Nørreport St.', "Timetable and Rejseplanen's delays")
    const list = await within(stop).findByRole('list', { name: 'Arrivals' })
    expect(list).toHaveTextContent('~')
    const tab = within(stop).getByRole('tabpanel', { name: 'Arrivals' })
    expect(tab).toHaveTextContent(
      "Countdowns use the timetable, moved by Rejseplanen's delay where a trip has one; the rest use the timetable alone.",
    )
    expect(tab).toHaveTextContent("Timetable and Rejseplanen's delays · updated 09:21:52")
  })

  it('says Cancelled for a cancelled trip’s departure', async () => {
    open('en', '?stop=5344')
    const stop = await panel('Fændediget', "Timetable and Rejseplanen's delays")
    // Bus 102A to Køge St. of 09:22, cancelled whole, due here at 09:40.
    const koege = row(within(stop).getByRole('list', { name: 'Departures' }), '102A', 'Køge St.')
    expect(koege).toHaveTextContent('Cancelled')
    expect(koege).toHaveTextContent('09:40')
  })

  it('says Cancelled for the departures of trips that skip the stop', async () => {
    open('en', '?stop=30090')
    const stop = await panel('Otto Mønsteds Plads', "Timetable and Rejseplanen's delays")
    const departures = within(stop).getByRole('list', { name: 'Departures' })
    expect(row(departures, 'Lyngby St.')).toHaveTextContent('Cancelled')
    expect(row(departures, 'Kigkurren')).toHaveTextContent('Cancelled')
    expect(row(departures, 'Bella Center St.')).not.toHaveTextContent('Cancelled')
  })

  it('says the same in Danish', async () => {
    open('da', '?stop=6584')
    const stop = await panel('Nørreport St.', 'Køreplan og Rejseplanens forsinkelser')
    const departures = within(stop).getByRole('list', { name: 'Afgange' })
    expect(row(departures, 'Klampenborg St.')).toHaveTextContent('~09:23')
    const baastad = row(departures, 'Båstad')
    expect(baastad).toHaveTextContent('Kun køreplan')
    expect(baastad).toHaveTextContent('—')
    expect(stop).toHaveTextContent(
      'Nedtællinger bruger køreplanen, rykket med Rejseplanens forsinkelse, hvor en tur har en; resten bruger køreplanen alene.',
    )
    expect(stop).toHaveTextContent('Køreplan og Rejseplanens forsinkelser · opdateret 09:21:52')
  })

  it('says Cancelled in Danish', async () => {
    open('da', '?stop=5344')
    const stop = await panel('Fændediget', 'Køreplan og Rejseplanens forsinkelser')
    const koege = row(within(stop).getByRole('list', { name: 'Afgange' }), '102A', 'Køge St.')
    expect(koege).toHaveTextContent('Aflyst')
  })
})
