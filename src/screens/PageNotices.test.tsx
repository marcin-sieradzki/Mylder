import '@mylder/perron/tokens.css'
import { act, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveAircraft } from '../map/aircraft'
import { liveSnapshot } from '../map/live'
import type { AircraftSnapshot } from '../tracker/aircraft/index'
import type { Snapshot } from '../tracker/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// The page notices over the map (docs/screens.md, "Page notices"), from saved snapshots of the
// recordings. The server's clock is set through the offset the poll would have read from the
// answer's date header, so each notice is seen at a chosen moment of the recording.

const saved = (name: string, recording = 'weekday'): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', recording, 'snapshots', name), 'utf8'),
  ) as Snapshot

/** The timetable routes as the server answers them on the weekday recording. */
const timetableRoutes = async (input: RequestInfo | URL): Promise<Response> => {
  const folder = join(process.cwd(), 'recordings', 'weekday', 'timetable')
  const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8')) as {
    version: string
    files: Record<string, string>
  }
  const [, version, file] = /^\/api\/timetable\/([^/]+)\/(\w+)$/.exec(String(input)) ?? []
  if (version !== manifest.version) return new Response(null, { status: 404 })
  const body =
    file === 'manifest'
      ? JSON.stringify(manifest)
      : readFileSync(join(folder, manifest.files[file]), 'utf8')
  return new Response(body, { headers: { 'content-type': 'application/json' } })
}

const renderScreen = (lang: Lang) =>
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )

/** The offset that makes the server's clock read `iso` now. */
const serverClockAt = (iso: string) => Date.parse(iso) - Date.now()

/** A snapshot landed, read with the server's clock at `iso`. */
const land = (snapshot: Snapshot, iso = '2026-06-16T05:23:10Z') =>
  act(() =>
    liveSnapshot.update({ snapshot, clockOffset: serverClockAt(iso), failingSince: undefined }),
  )

/** The notices' words, top to bottom: the statuses outside the City sheet, which has its own. */
const notices = () =>
  screen
    .queryAllByRole('status')
    .filter((status) => !status.closest('[role="dialog"]'))
    .map((notice) => notice.textContent)

const updatedLine = () => within(screen.getByRole('banner')).getByText(/^(Updated|Opdateret) /)

/** The weekday's fourth minute, fetched at 07:23:00 in Copenhagen, as the live tracker serves it. */
const live = (): Snapshot => ({ ...saved('0004.json'), source: { kind: 'rejseplanen' } })

beforeEach(() => {
  window.history.replaceState(null, '', '/en')
  vi.stubGlobal('fetch', timetableRoutes)
})

/** The weekday recording's first aircraft snapshot, from `provider`. */
const aircraft = (provider: AircraftSnapshot['provider']): AircraftSnapshot => ({
  ...(JSON.parse(
    readFileSync(
      join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', '0001.json'),
      'utf8',
    ),
  ) as AircraftSnapshot),
  provider,
})

afterEach(() => {
  liveSnapshot.update({ snapshot: undefined, failingSince: undefined, clockOffset: 0 })
  liveAircraft.update({ snapshot: undefined })
  vi.unstubAllGlobals()
})

describe('the source banner', () => {
  it('says the data is recorded, and from when', () => {
    land(saved('0004.json'))
    renderScreen('en')
    expect(notices()).toEqual(['Recorded data from 16 June 2026.'])
  })

  it('says it in Danish', () => {
    land(saved('0004.json'))
    renderScreen('da')
    expect(notices()).toEqual(['Optagne data fra 16. juni 2026.'])
  })

  it('says a simulated page is made up, in both languages', () => {
    const simulated: Snapshot = {
      ...saved('0004.json'),
      source: { kind: 'simulated', name: 'weekday' },
    }
    land(simulated)
    const { unmount } = renderScreen('en')
    expect(notices()).toEqual([
      'Simulated data: vehicles and times are made up from the timetable.',
    ])
    unmount()
    renderScreen('da')
    expect(notices()).toEqual([
      'Simulerede data: køretøjer og tider er digtet op ud fra køreplanen.',
    ])
  })

  it('names the transit as simulated and the planes as live, in both languages', () => {
    land({ ...saved('0004.json'), source: { kind: 'simulated', name: 'weekday' } })
    act(() => liveAircraft.update({ snapshot: aircraft('adsb.lol') }))
    const { unmount } = renderScreen('en')
    expect(notices()).toEqual([
      'Simulated data: vehicles and times are made up from the timetable. Planes: live from adsb.lol.',
    ])
    unmount()
    renderScreen('da')
    expect(notices()).toEqual([
      'Simulerede data: køretøjer og tider er digtet op ud fra køreplanen. Fly: live fra adsb.lol.',
    ])
  })

  it('says the planes are recorded too, in both languages', () => {
    land(saved('0004.json'))
    act(() => liveAircraft.update({ snapshot: aircraft('recording') }))
    const { unmount } = renderScreen('en')
    expect(notices()).toEqual(['Recorded data from 16 June 2026. Planes: recorded.'])
    unmount()
    renderScreen('da')
    expect(notices()).toEqual(['Optagne data fra 16. juni 2026. Fly: optaget.'])
  })

  it('says recorded planes are recorded when the transit is Rejseplanen’s, and live ones nothing', () => {
    land(live())
    act(() => liveAircraft.update({ snapshot: aircraft('recording') }))
    renderScreen('en')
    expect(notices()).toEqual(['Planes: recorded.'])
    act(() => liveAircraft.update({ snapshot: aircraft('adsb.lol') }))
    expect(notices()).toEqual([])
  })

  it('is not there when the data is Rejseplanen’s', () => {
    land(live())
    renderScreen('en')
    expect(notices()).toEqual([])
  })
})

/** The browser's polls failing since `iso` on the server's clock. */
const failingFrom = (iso: string) =>
  act(() => liveSnapshot.update({ failingSince: Date.parse(iso) - liveSnapshot.get().clockOffset }))

describe('the Disconnected notice', () => {
  it('shows at once when a poll fails, naming the last data, and the Updated line keeps its time', () => {
    land(live())
    renderScreen('en')
    expect(updatedLine()).toHaveTextContent('Updated 07:23:00')
    // The next poll, due at 07:24:00 and a jitter, failed at 07:24:03 on the server's clock.
    failingFrom('2026-06-16T05:24:03Z')
    expect(notices()).toEqual([
      'No connection since 07:24. Vehicles move on the last data from 07:23:00.',
    ])
    expect(updatedLine()).toHaveTextContent('Updated 07:23:00')
  })

  it('says it in Danish, and clears on the next good poll', () => {
    land(live())
    renderScreen('da')
    failingFrom('2026-06-16T05:24:03Z')
    expect(notices()).toEqual([
      'Ingen forbindelse siden 07:24. Køretøjerne bevæger sig på de seneste data fra 07:23:00.',
    ])
    land({ ...saved('0005.json'), source: { kind: 'rejseplanen' } }, '2026-06-16T05:24:31Z')
    expect(notices()).toEqual([])
    expect(updatedLine()).toHaveTextContent('Opdateret 07:24:00')
  })

  it('names the last answer’s time, as the Updated line does, not the last snapshot’s', () => {
    land(live())
    renderScreen('en')
    // The next runs failed, so the snapshot of 07:25:00 carries the answer of 07:23:00 on.
    land(failing(), '2026-06-16T05:25:31Z')
    failingFrom('2026-06-16T05:26:34Z')
    expect(notices()).toEqual([
      'No connection since 07:26. Vehicles move on the last data from 07:23:00.',
    ])
    expect(updatedLine()).toHaveTextContent('Updated 07:23:00')
  })

  it('names only the time when no snapshot has landed yet', () => {
    act(() => liveSnapshot.update({ clockOffset: serverClockAt('2026-06-16T05:20:02Z') }))
    failingFrom('2026-06-16T05:20:02Z')
    renderScreen('en')
    expect(notices()).toEqual(['No connection since 07:20.'])
  })
})

/**
 * The weekday's sixth minute, with Rejseplanen failing since the fifth's run at 07:24:00: the
 * last answer was the fourth's, at 07:23:00, the last that carried any trip.
 */
const failing = (
  status: 'error' | 'empty' = 'error',
  since = '2026-06-16T05:24:00Z',
): Snapshot => ({
  ...saved('0006.json'),
  source: { kind: 'rejseplanen' },
  api: { status, since: Date.parse(since), ...(status === 'error' ? { kind: 'status' } : {}) },
  lastSeen: saved('0004.json').lastSeen,
})

describe('the Paused notice', () => {
  it('says at once when the month is spent, naming the day live data resumes', () => {
    land(live())
    renderScreen('en')
    // The month's calls ran out at the next run: Rejseplanen's quota error.
    land({ ...saved('0002.json', 'spent'), source: { kind: 'rejseplanen' } })
    expect(notices()).toEqual(["Live data is paused until 1 July: this month's calls are used up."])
    expect(updatedLine()).toHaveTextContent('Updated 07:23:00, paused')
  })

  it('says it in Danish, for a refused key too', () => {
    land({ ...saved('0001.json', 'refused-key'), source: { kind: 'rejseplanen' } })
    renderScreen('da')
    expect(notices()).toEqual([
      'Live-data er sat på pause indtil 1. juli: denne måneds kald er brugt op.',
    ])
    expect(updatedLine()).toHaveTextContent('Opdateret —, sat på pause')
  })

  it('names the time Rejseplanen stopped answering, once that is past the Live limit', () => {
    // Alternating modes report every other minute: the Live limit is 4 min, so 07:27:00.
    land(live())
    renderScreen('en')
    land(failing(), '2026-06-16T05:26:59Z')
    expect(notices()).toEqual([])
    expect(updatedLine()).toHaveTextContent('Updated 07:23:00')
    land(failing(), '2026-06-16T05:27:00Z')
    expect(notices()).toEqual(["Rejseplanen hasn't answered since 07:23."])
    expect(updatedLine()).toHaveTextContent('Updated 07:23:00, paused')
  })

  it('keeps its time while Rejseplanen switches from failing to answering nothing', () => {
    land(failing(), '2026-06-16T05:27:30Z')
    renderScreen('en')
    expect(notices()).toEqual(["Rejseplanen hasn't answered since 07:23."])
    land(failing('empty', '2026-06-16T05:27:00Z'), '2026-06-16T05:28:00Z')
    expect(notices()).toEqual(["Rejseplanen hasn't answered since 07:23."])
  })

  it('times a page opened mid-outage from the last answer the snapshot carries', () => {
    land(failing(), '2026-06-16T05:27:00Z')
    renderScreen('en')
    expect(notices()).toEqual(["Rejseplanen hasn't answered since 07:23."])
    expect(updatedLine()).toHaveTextContent('Updated 07:23:00, paused')
  })

  it('says it in Danish, and lifts on the first good answer', () => {
    land(live())
    renderScreen('da')
    land(failing(), '2026-06-16T05:28:10Z')
    expect(notices()).toEqual(['Rejseplanen har ikke svaret siden 07:23.'])
    expect(updatedLine()).toHaveTextContent('Opdateret 07:23:00, sat på pause')
    land({ ...saved('0009.json'), source: { kind: 'rejseplanen' } }, '2026-06-16T05:28:31Z')
    expect(notices()).toEqual([])
    expect(updatedLine()).toHaveTextContent('Opdateret 07:28:00')
  })
})

describe('the budget line', () => {
  /** The weekday's third minute, with the poll stretched to `seconds`. */
  const stretched = (level: 'stretched' | 'tight', seconds: number): Snapshot => {
    const snapshot = { ...saved('0003.json'), source: { kind: 'rejseplanen' } } as const
    return {
      ...snapshot,
      pollInterval: seconds,
      nextDue: snapshot.fetched + seconds * 1000,
      budget: { ...snapshot.budget, level },
    }
  }

  it('says how often the map updates while the poll has stretched', () => {
    land(stretched('stretched', 90))
    renderScreen('en')
    expect(notices()).toEqual(['Updating every 90 s to stay within the data budget.'])
    land(stretched('tight', 120))
    expect(notices()).toEqual(['Updating every 2 min to stay within the data budget.'])
  })

  it('says it in Danish', () => {
    land(stretched('stretched', 90))
    renderScreen('da')
    expect(notices()).toEqual(['Kortet opdateres hvert 90. sekund for at overholde databudgettet.'])
    land(stretched('tight', 120))
    expect(notices()).toEqual(['Kortet opdateres hvert 2. minut for at overholde databudgettet.'])
  })
})

describe('the timetable notice', () => {
  /** The weekday's fourth minute, with `daysLeft` of service left in its timetable. */
  const runningOut = (daysLeft: number): Snapshot => {
    const snapshot = live()
    const { timetable } = snapshot.status
    return {
      ...snapshot,
      timetableRunningOut: true,
      status: { ...snapshot.status, timetable: { ...timetable, last: '2026-08-26', daysLeft } },
    }
  }

  it('shows while the snapshot says the timetable is running out, before it has loaded', () => {
    land(runningOut(6), '2026-08-21T10:00:00Z')
    renderScreen('en')
    expect(notices()).toEqual([
      'The timetable ends on 26 August. Without a new one, the map has no trips after that.',
    ])
  })

  it('is not there while the snapshot doesn’t say so, whatever the page’s clock', async () => {
    land(live(), '2026-08-21T10:00:00Z')
    renderScreen('en')
    // Wait for the snapshot's timetable to load.
    await screen.findByRole('group', { name: 'Filters' })
    expect(notices()).toEqual([])
  })

  it('says it in Danish, and says when it has ended', () => {
    land(runningOut(1), '2026-08-26T21:59:00Z')
    renderScreen('da')
    expect(notices()).toEqual([
      'Køreplanen slutter 26. august. Uden en ny har kortet ingen ture derefter.',
    ])
    // Midnight in Copenhagen: the last covered day is over.
    land(runningOut(0), '2026-08-26T22:00:00Z')
    expect(notices()).toEqual([
      'Køreplanen sluttede 26. august. Uden en ny har kortet ingen ture at vise.',
    ])
  })
})

describe('Disconnected and Paused together', () => {
  it('shows Disconnected, with the last snapshot’s Paused notice kept beneath it', () => {
    land(live())
    land({ ...saved('0002.json', 'spent'), source: { kind: 'rejseplanen' } })
    renderScreen('en')
    failingFrom('2026-06-16T05:23:04Z')
    expect(notices()).toEqual([
      'No connection since 07:23. Vehicles move on the last data from 07:23:00.',
      "Live data is paused until 1 July: this month's calls are used up.",
    ])
  })

  it('says both in Danish', () => {
    land(failing(), '2026-06-16T05:28:10Z')
    renderScreen('da')
    failingFrom('2026-06-16T05:28:12Z')
    expect(notices()).toEqual([
      'Ingen forbindelse siden 07:28. Køretøjerne bevæger sig på de seneste data fra 07:23:00.',
      'Rejseplanen har ikke svaret siden 07:23.',
    ])
  })
})
