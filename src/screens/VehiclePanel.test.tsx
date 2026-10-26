import '@mylder/perron/tokens.css'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveSnapshot } from '../map/live'
import { openPanel } from '../map/view'
import type { Snapshot, SnapshotTrip, TripDetail, TripMessage } from '../tracker/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// A vehicle's detail from the weekday recording: its snapshots, its timetable, and the trip
// route's answers saved at the start of its second minute, 07:21:00 in Copenhagen. jsdom has no
// server: the routes answer from those files, and a test changes one where the recording shows no
// such case. Each state is the one the browser's clock gives the snapshot's trip.
const recording = join(process.cwd(), 'recordings', 'weekday')
const read = (path: string): unknown => JSON.parse(readFileSync(join(recording, path), 'utf8'))
const minute = (file: string) => read(`snapshots/${file}`) as Snapshot
const saved = (key: string) => read(`answers/trips/${key}.json`) as TripDetail

/** Fetched at 07:21:00, the saved answers' minute. */
const minute2 = minute('0002.json')
/** Fetched at 07:25:00, with the 07:30 bus Waiting at its first stop. */
const minute6 = minute('0006.json')

/** Line A to Hillerød St., reported at 07:21:00, four minutes late. */
const A_LIVE = 's-tog.A.0bc307e3eb.20260616.0707'
/** Bus 5C to Husum Torv, on a computed position from 07:20:00, two minutes late. */
const BUS_ESTIMATED = 'bus.5C.32331e0e20.20260616.0707'
/** M1 to Vestamager, on its interval. */
const M1 = 'metro.M1.7f21f99145.20260616.0707'
/** Bus 991 to Teglholmen, Timetable only, Waiting at Orientkaj St. from 07:25 to leave at 07:30. */
const BUS_WAITING = 'bus.991.7ce514fd98.20260616.0730'

/** Line A to Hillerød St. again, the next trip of its pattern, for a corrected join. */
const A_LATER = 's-tog.A.0bc307e3eb.20260616.0717'

/** The trip's detail called at 07:21:20, twenty seconds after the saved answers' minute. */
const CALLED = minute2.fetched + 20_000

/**
 * A's saved answer as one from its detail: Rejseplanen five minutes late at its next call,
 * København Syd St. (call 7) cancelled, and a message on Sydhavn St. to København H (calls 9 to
 * 11), running an hour either side of the minute.
 */
function fromDetail(): TripDetail {
  const answer = saved(A_LIVE)
  const message: TripMessage = {
    fieldsKind: 'delays',
    from: minute2.fetched - 3600_000,
    to: minute2.fetched + 3600_000,
    message: { id: 'slow', head: 'Langsom kørsel', lead: 'Togene kører langsomt ved Sydhavn.' },
    calls: { first: 9, last: 11 },
  }
  return {
    ...answer,
    nextCallDelay: 300,
    source: { kind: 'rejseplanen', at: CALLED },
    calls: answer.calls.map((call) => (call.index === 7 ? { ...call, cancelled: true } : call)),
    messages: [message],
  }
}

/** The trip route's answers by key; a trip missing here is a 404. */
let answers: Map<string, TripDetail>

const timetable = read('timetable/manifest.json') as {
  version: string
  files: Record<string, string>
}

/** The trip route from the saved answers, and the timetable routes from the recording's files. */
const routes = async (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input)
  const [, key] = /^\/api\/trips\/([^/]+)$/.exec(url) ?? []
  if (key !== undefined) {
    const answer = answers.get(decodeURIComponent(key))
    return answer
      ? Response.json(answer)
      : Response.json({ error: 'unknown trip' }, { status: 404 })
  }
  const [, version, file] = /^\/api\/timetable\/([^/]+)\/(\w+)$/.exec(url) ?? []
  if (version !== timetable.version) return new Response(null, { status: 404 })
  return file === 'manifest'
    ? Response.json(timetable)
    : new Response(readFileSync(join(recording, 'timetable', timetable.files[file]), 'utf8'))
}

/** `snapshot` with the trip of `key` changed by `change`. */
const withTrip = (snapshot: Snapshot, key: string, change: Partial<SnapshotTrip>): Snapshot => ({
  ...snapshot,
  trips: snapshot.trips.map((trip) => (trip.key === key ? { ...trip, ...change } : trip)),
})

/**
 * Opens the detail of `key` in `lang` on `snapshot`, with the server's clock `seconds` after the
 * snapshot's fetch.
 */
function openTrip(lang: Lang, key: string, snapshot = minute2, seconds = 0) {
  vi.setSystemTime(snapshot.fetched + seconds * 1000)
  liveSnapshot.update({ snapshot, clockOffset: 0 })
  window.history.replaceState(null, '', `/${lang}?trip=${key}`)
  return render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )
}

/** The open panel, once its answer has landed and the timetable has loaded. */
async function panel(name: string | RegExp, words: string | RegExp) {
  const found = await screen.findByRole('dialog', { name })
  await within(found).findAllByText(words)
  return found
}

/** The value of the fact named `label`. */
const fact = (within_: HTMLElement, label: string) =>
  within(within_).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  answers = new Map(
    [A_LIVE, BUS_ESTIMATED, M1, BUS_WAITING].map((key) => [key, saved(key)] as const),
  )
  vi.stubGlobal('fetch', routes)
})

afterEach(() => {
  act(() => openPanel(undefined))
  liveSnapshot.update({ snapshot: undefined })
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("a vehicle's detail", () => {
  it('names the line, where it is going and its mode, and says a Live vehicle reported', async () => {
    // A minute after it reported at Avedøre St., on its way to Friheden St.
    openTrip('en', A_LIVE, minute2, 60)
    const trip = await panel(/to Hillerød St\./, 'Reported by the vehicle; seen 07:21:00')
    expect(within(trip).getByRole('heading')).toHaveTextContent('A')
    expect(trip).toHaveTextContent('S-tog')
    expect(trip).toHaveTextContent('Live')
    expect(fact(trip, 'Delay')).toHaveTextContent('+4 min')
    expect(fact(trip, 'Last seen')).toHaveTextContent('07:21:00')
    expect(fact(trip, 'Next stop')).toHaveTextContent('Friheden St.')
    expect(trip).toHaveTextContent('Between Avedøre St. and Friheden St.')
    expect(trip).toHaveTextContent(
      'Rejseplanen position · updated 07:21:00 · Timetable · updated 07:21:00',
    )
    expect(trip).toHaveTextContent('From the timetable')
  })

  it('lists its stops with the timetabled times, the expected ones and the delay', async () => {
    openTrip('en', A_LIVE)
    const trip = await panel(/to Hillerød St\./, 'Reported by the vehicle; seen 07:21:00')
    const stops = within(trip).getByRole('list', { name: 'Stops' })
    const items = within(stops).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Hundige St.')
    expect(items[0]).toHaveTextContent('07:07')
    expect(items[0]).toHaveTextContent('~07:11')
    expect(items[0]).toHaveTextContent('+4')
    const next = items.find((item) => item.textContent?.includes('Friheden St.'))!
    expect(next).toHaveTextContent('Next stop')
  })

  it('follows the clock into Ageing, then No signal, with no poll', async () => {
    const { unmount } = openTrip('en', A_LIVE, minute2, 270)
    let trip = await panel(
      /to Hillerød St\./,
      'Last reported 07:21; moving on the timetable since.',
    )
    expect(trip).toHaveTextContent('Ageing')
    expect(fact(trip, 'Last seen')).toHaveTextContent('07:21:00')
    unmount()
    openTrip('en', A_LIVE, minute2, 330)
    trip = await panel(
      /to Hillerød St\./,
      'No signal since 07:21; moving on the timetable and its last delay.',
    )
    expect(fact(trip, 'Delay')).toHaveTextContent('—')
    expect(fact(trip, 'Last seen')).toHaveTextContent('—')
    expect(trip).toHaveTextContent('Last seen near Avedøre St.')
    expect(trip).toHaveTextContent('Delay unknown')
    const stops = within(trip).getByRole('list', { name: 'Stops' })
    expect(within(stops).getAllByRole('listitem')[0]).toHaveTextContent('07:07')
    expect(within(stops).queryByText('~07:11')).not.toBeInTheDocument()
  })

  it('says a computed position is Rejseplanen’s', async () => {
    openTrip('en', BUS_ESTIMATED)
    const trip = await panel(/to Husum Torv/, 'Position computed by Rejseplanen')
    expect(trip).toHaveTextContent('Estimated')
    expect(trip).toHaveTextContent('Bus')
    expect(fact(trip, 'Delay')).toHaveTextContent('+2 min')
  })

  it('says an estimate from the timetable gives its delay', async () => {
    const updated = withTrip(minute2, BUS_ESTIMATED, {
      source: 'timetable',
      updated: minute2.fetched,
      delay: 180,
    })
    answers.set(BUS_ESTIMATED, { ...saved(BUS_ESTIMATED), delay: 180 })
    openTrip('en', BUS_ESTIMATED, updated)
    const trip = await panel(/to Husum Torv/, 'Estimated from the timetable and a delay of +3 min')
    expect(fact(trip, 'Delay')).toHaveTextContent('+3 min')
  })

  it('says a Timetable only trip has no realtime, and where it waits to leave', async () => {
    openTrip('en', BUS_WAITING, minute6)
    const trip = await panel(
      /to Teglholmen/,
      'No realtime for this trip today; placed from the timetable.',
    )
    expect(trip).toHaveTextContent('Waiting at Orientkaj St. (Orientkaj), departs 07:30')
    expect(fact(trip, 'Delay')).toHaveTextContent('—')
    expect(fact(trip, 'Next stop')).toHaveTextContent('Orientkaj St. (Orientkaj)')
    // No position from Rejseplanen: the source line names the timetable alone.
    expect(trip).toHaveTextContent('Timetable · updated 07:21:00')
    expect(trip).not.toHaveTextContent('Rejseplanen position')
  })

  it('says a Metro trip runs to an interval, and lists its stops without times', async () => {
    openTrip('en', M1)
    const trip = await panel(/to Vestamager St\./, 'Every 4 min')
    expect(trip).toHaveTextContent('Metro')
    expect(trip).toHaveTextContent('Runs to an interval')
    expect(fact(trip, 'Delay')).toHaveTextContent('Runs to an interval')
    const stops = within(trip).getByRole('list', { name: 'Stops' })
    expect(within(stops).getAllByRole('listitem')[0]).toHaveTextContent('Vanløse St.')
    expect(stops).not.toHaveTextContent(/\d\d:\d\d/)
  })

  it('lists a Metro trip’s times once its line has realtime, as its stops’ departures do', async () => {
    // The answer says the line left the interval rule: another M1 trip carried realtime.
    const { runsToInterval: _rule, interval: _interval, ...timed } = saved(M1)
    answers.set(M1, timed)
    openTrip('en', M1)
    const trip = await panel(/to Vestamager St\./, /Vanløse St\./)
    expect(trip).not.toHaveTextContent('Runs to an interval')
    const stops = within(trip).getByRole('list', { name: 'Stops' })
    expect(within(stops).getAllByRole('listitem')[0]).toHaveTextContent(/\d\d:\d\d/)
  })

  it('says a cancelled trip is cancelled, and keeps its stops, marked', async () => {
    answers.set(BUS_ESTIMATED, { ...saved(BUS_ESTIMATED), cancelled: true })
    openTrip('en', BUS_ESTIMATED, withTrip(minute2, BUS_ESTIMATED, { cancelled: true }))
    const trip = await panel(/to Husum Torv/, 'Cancelled')
    expect(trip).not.toHaveTextContent('Estimated')
    expect(fact(trip, 'Next stop')).toHaveTextContent('—')
    const stops = within(trip).getByRole('list', { name: 'Stops' })
    for (const item of within(stops).getAllByRole('listitem'))
      expect(item).toHaveAttribute('data-cancelled')
  })

  it('says a trip the route doesn’t know is not found, in both languages', async () => {
    const { unmount } = openTrip('en', 'bus.5C.nothing.20260616.0700')
    expect(await screen.findByRole('dialog', { name: 'Trip not found' })).toBeInTheDocument()
    unmount()
    openTrip('da', 'bus.5C.nothing.20260616.0700')
    expect(await screen.findByRole('dialog', { name: 'Turen findes ikke' })).toBeInTheDocument()
  })

  it('closes on its close button, and leaves the address', async () => {
    openTrip('en', A_LIVE)
    const trip = await panel(/to Hillerød St\./, 'Reported by the vehicle; seen 07:21:00')
    fireEvent.click(within(trip).getByRole('button', { name: 'Close' }))
    expect(window.location.search).toBe('')
  })
})

describe("a vehicle's detail from its trip's detail", () => {
  it('gives the delay Rejseplanen has at its next call', async () => {
    answers.set(A_LIVE, fromDetail())
    openTrip('en', A_LIVE)
    const trip = await panel(/to Hillerød St\./, 'Reported by the vehicle; seen 07:21:00')
    expect(fact(trip, 'Delay')).toHaveTextContent('+5 min')
  })

  it('marks a cancelled call, keeping it in the list', async () => {
    answers.set(A_LIVE, fromDetail())
    openTrip('en', A_LIVE)
    const trip = await panel(/to Hillerød St\./, 'Reported by the vehicle; seen 07:21:00')
    const items = within(within(trip).getByRole('list', { name: 'Stops' })).getAllByRole('listitem')
    expect(items[7]).toHaveTextContent('København Syd St.')
    expect(items[7]).toHaveTextContent('Cancelled')
    expect(items[7]).toHaveAttribute('data-cancelled')
    expect(items[6]).not.toHaveAttribute('data-cancelled')
  })

  it('shows its own messages as cards after its stops, each one’s stops marked on the list', async () => {
    answers.set(A_LIVE, fromDetail())
    openTrip('en', A_LIVE)
    const trip = await panel(/to Hillerød St\./, 'Reported by the vehicle; seen 07:21:00')
    const stops = within(trip).getByRole('list', { name: 'Stops' })
    const items = within(stops).getAllByRole('listitem')
    expect(items[9]).toHaveTextContent('Sydhavn St. — Langsom kørsel from here')
    expect(items[11]).toHaveTextContent('København H — Langsom kørsel to here')
    expect(items[10]).not.toHaveTextContent('Langsom kørsel')
    const cards = within(trip).getByRole('region', { name: 'Messages' })
    expect(stops.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const [card] = within(cards).getAllByRole('listitem')
    expect(card).toHaveTextContent('Delays')
    expect(card).toHaveTextContent('Langsom kørsel')
    expect(card).toHaveTextContent('Togene kører langsomt ved Sydhavn.')
    expect(cards).toHaveTextContent('From Rejseplanen, in Danish; checked 07:21')
  })

  it('names the position’s time and the times’ own in its source line', async () => {
    answers.set(A_LIVE, fromDetail())
    openTrip('en', A_LIVE, minute2, 60)
    const trip = await panel(/to Hillerød St\./, 'Reported by the vehicle; seen 07:21:00')
    expect(trip).toHaveTextContent(
      'Rejseplanen position · updated 07:21:00 · Rejseplanen times · updated 07:21:20',
    )
    expect(trip).not.toHaveTextContent('From the timetable')
  })

  it('opens the trip its detail corrects the join to', async () => {
    answers.set(A_LIVE, { ...fromDetail(), key: A_LATER })
    answers.set(A_LATER, { ...fromDetail(), key: A_LATER })
    openTrip('en', A_LIVE)
    await panel(/to Hillerød St\./, 'Langsom kørsel')
    expect(window.location.search).toBe(`?trip=${A_LATER}`)
  })

  it('says the same in Danish', async () => {
    answers.set(A_LIVE, fromDetail())
    openTrip('da', A_LIVE)
    const trip = await panel(/mod Hillerød St\./, 'Meldt af køretøjet; set 07:21:00')
    expect(fact(trip, 'Forsinkelse')).toHaveTextContent('+5 min')
    const items = within(within(trip).getByRole('list', { name: 'Stop' })).getAllByRole('listitem')
    expect(items[7]).toHaveTextContent('Aflyst')
    expect(items[9]).toHaveTextContent('Sydhavn St. — Langsom kørsel herfra')
    expect(items[11]).toHaveTextContent('København H — Langsom kørsel hertil')
    const cards = within(trip).getByRole('region', { name: 'Meddelelser' })
    expect(cards).toHaveTextContent('Fra Rejseplanen; tjekket 07:21')
    expect(trip).toHaveTextContent(
      'Rejseplanen-position · opdateret 07:21:00 · Rejseplanen-tider · opdateret 07:21:20',
    )
    expect(trip).not.toHaveTextContent('Fra køreplanen')
  })
})

describe("a vehicle's detail in Danish", () => {
  it('says a Live vehicle reported, with its facts and where it is', async () => {
    openTrip('da', A_LIVE)
    const trip = await panel(/mod Hillerød St\./, 'Meldt af køretøjet; set 07:21:00')
    expect(fact(trip, 'Forsinkelse')).toHaveTextContent('+4 min')
    expect(fact(trip, 'Sidst set')).toHaveTextContent('07:21:00')
    expect(fact(trip, 'Næste stop')).toHaveTextContent('Friheden St.')
    // Reported at Avedøre St., at the moment it reported.
    expect(trip).toHaveTextContent('Ved Avedøre St.')
    expect(trip).toHaveTextContent('Fra køreplanen')
    expect(trip).toHaveTextContent('Rejseplanen-position · opdateret 07:21:00')
  })

  it('says Ageing and No signal', async () => {
    const { unmount } = openTrip('da', A_LIVE, minute2, 270)
    await panel(/mod Hillerød St\./, 'Sidst meldt 07:21; kører efter køreplanen siden.')
    unmount()
    openTrip('da', A_LIVE, minute2, 330)
    const trip = await panel(
      /mod Hillerød St\./,
      'Intet signal siden 07:21; kører efter køreplanen og sin seneste forsinkelse.',
    )
    expect(trip).toHaveTextContent('Sidst set nær Avedøre St.')
  })

  it('says both kinds of Estimated', async () => {
    const { unmount } = openTrip('da', BUS_ESTIMATED)
    const computed = await panel(/mod Husum Torv/, 'Position beregnet af Rejseplanen')
    expect(computed).toHaveTextContent('Beregnet')
    unmount()
    answers.set(BUS_ESTIMATED, { ...saved(BUS_ESTIMATED), delay: 180 })
    openTrip(
      'da',
      BUS_ESTIMATED,
      withTrip(minute2, BUS_ESTIMATED, { source: 'timetable', updated: minute2.fetched }),
    )
    const trip = await panel(
      /mod Husum Torv/,
      'Beregnet ud fra køreplanen og en forsinkelse på +3 min',
    )
    expect(fact(trip, 'Forsinkelse')).toHaveTextContent('+3 min')
  })

  it('says Timetable only, and Waiting', async () => {
    openTrip('da', BUS_WAITING, minute6)
    const trip = await panel(
      /mod Teglholmen/,
      'Ingen realtid for denne tur i dag; placeret efter køreplanen.',
    )
    expect(trip).toHaveTextContent('Venter ved Orientkaj St. (Orientkaj), afgår 07:30')
  })

  it('says a Metro trip runs to an interval', async () => {
    openTrip('da', M1)
    const trip = await panel(/mod Vestamager St\./, 'Hvert 4. min')
    expect(trip).toHaveTextContent('Kører med fast interval')
  })

  it('says a cancelled trip is cancelled', async () => {
    answers.set(BUS_ESTIMATED, { ...saved(BUS_ESTIMATED), cancelled: true })
    openTrip('da', BUS_ESTIMATED, withTrip(minute2, BUS_ESTIMATED, { cancelled: true }))
    const trip = await screen.findByRole('dialog', { name: /mod Husum Torv/ })
    expect(await within(trip).findAllByText('Aflyst')).not.toHaveLength(0)
  })
})
