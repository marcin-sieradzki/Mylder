import '@mylder/perron/tokens.css'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { followedVehicle } from '../map/follow'
import { mapHighlight } from '../map/highlight'
import { liveSnapshot } from '../map/live'
import { openPanel } from '../map/view'
import type { Snapshot, SnapshotTrip, TripDetail } from '../tracker/index'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// Follow and Show whole line in vehicle detail, and the highlight chip they raise over the map
// (docs/screens.md, "Vehicle detail", "The highlight chip"): from the weekday recording's second
// minute, its timetable and the trip route's answers saved then. jsdom has no WebGL, so the map
// itself never starts: these read what the screen says and what it hands the map.
const recording = join(process.cwd(), 'recordings', 'weekday')
const read = (path: string): unknown => JSON.parse(readFileSync(join(recording, path), 'utf8'))
const minute2 = read('snapshots/0002.json') as Snapshot
const saved = (key: string) => read(`answers/trips/${key}.json`) as TripDetail

/** Bus 5C to Husum Torv, on a computed position. */
const BUS = 'bus.5C.32331e0e20.20260616.0707'
/** M1 to Vestamager, on its interval. */
const M1 = 'metro.M1.7f21f99145.20260616.0707'

const timetable = read('timetable/manifest.json') as {
  version: string
  files: Record<string, string>
}
let answers: Map<string, TripDetail>

/** The trip route from the saved answers, and the timetable routes from the recording's files. */
const routes = async (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input)
  const [, key] = /^\/api\/trips\/([^/]+)$/.exec(url) ?? []
  if (key !== undefined) {
    const answer = answers.get(decodeURIComponent(key))
    return answer ? Response.json(answer) : Response.json({}, { status: 404 })
  }
  const [, version, file] = /^\/api\/timetable\/([^/]+)\/(\w+)$/.exec(url) ?? []
  if (version !== timetable.version) return new Response(null, { status: 404 })
  return file === 'manifest'
    ? Response.json(timetable)
    : new Response(readFileSync(join(recording, 'timetable', timetable.files[file]), 'utf8'))
}

/** The map screen in `lang` on `snapshot`, with the detail of `key` open. */
function openTrip(lang: Lang, key: string, snapshot = minute2) {
  vi.setSystemTime(snapshot.fetched)
  liveSnapshot.update({ snapshot, clockOffset: 0 })
  window.history.replaceState(null, '', `/${lang}?trip=${key}`)
  return render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )
}

/** The open panel's button named `name`, once the answer and the timetable have landed. */
async function action(panel: string | RegExp, name: string) {
  const found = await screen.findByRole('dialog', { name: panel })
  const button = await within(found).findByRole('button', { name })
  await vi.waitFor(() => expect(button).toBeEnabled())
  return button
}

const chip = (name: string | RegExp) => screen.queryByRole('button', { name })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  answers = new Map([BUS, M1].map((key) => [key, saved(key)] as const))
  vi.stubGlobal('fetch', routes)
})

afterEach(() => {
  act(() => {
    openPanel(undefined)
    mapHighlight.clear()
  })
  liveSnapshot.update({ snapshot: undefined })
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Follow', () => {
  it('is pressed while the map follows the vehicle, and lets go when pressed again', async () => {
    openTrip('en', BUS)
    const follow = await action(/to Husum Torv/, 'Follow')
    expect(follow).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(follow)
    expect(follow).toHaveAttribute('aria-pressed', 'true')
    expect(followedVehicle.get()).toBe(BUS)
    fireEvent.click(follow)
    expect(follow).toHaveAttribute('aria-pressed', 'false')
    expect(followedVehicle.get()).toBeUndefined()
  })

  it('follows a Metro train too', async () => {
    openTrip('en', M1)
    const follow = await action(/to Vestamager St\./, 'Follow')
    fireEvent.click(follow)
    expect(follow).toHaveAttribute('aria-pressed', 'true')
    expect(followedVehicle.get()).toBe(M1)
  })

  it('ends when the panel closes, and is not pressed when it opens again', async () => {
    const { unmount } = openTrip('en', BUS)
    fireEvent.click(await action(/to Husum Torv/, 'Follow'))
    act(() => openPanel(undefined))
    expect(followedVehicle.get()).toBeUndefined()
    unmount()
    openTrip('en', BUS)
    expect(await action(/to Husum Torv/, 'Follow')).toHaveAttribute('aria-pressed', 'false')
  })

  it('ends when it shows the whole line, which moves the camera to the line', async () => {
    openTrip('en', BUS)
    const follow = await action(/to Husum Torv/, 'Follow')
    fireEvent.click(follow)
    fireEvent.click(await action(/to Husum Torv/, 'Show whole line'))
    expect(follow).toHaveAttribute('aria-pressed', 'false')
  })

  it('cannot follow a trip that is not on the map', async () => {
    const away: Snapshot = {
      ...minute2,
      trips: minute2.trips.map((trip): SnapshotTrip =>
        trip.key === BUS ? { ...trip, cancelled: true } : trip,
      ),
    }
    openTrip('en', BUS, away)
    const found = await screen.findByRole('dialog', { name: /to Husum Torv/ })
    await within(found).findByRole('button', { name: 'Show whole line' })
    expect(within(found).getByRole('button', { name: 'Follow' })).toBeDisabled()
  })

  it('reads Følg in Danish', async () => {
    openTrip('da', BUS)
    const follow = await action(/mod Husum Torv/, 'Følg')
    fireEvent.click(follow)
    expect(follow).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Show whole line', () => {
  it("highlights the trip's pattern and raises the chip, which clears it", async () => {
    openTrip('en', BUS)
    fireEvent.click(await action(/to Husum Torv/, 'Show whole line'))
    expect(mapHighlight.get()?.label).toEqual({ kind: 'line', line: '5C' })
    expect(mapHighlight.get()?.stops).toHaveLength(35)
    const raised = chip('Showing: line 5C · Clear')!
    expect(raised).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(raised)
    expect(mapHighlight.get()).toBeUndefined()
    expect(chip(/Showing/)).not.toBeInTheDocument()
  })

  it('keeps the highlight when the panel closes, until Esc clears it', async () => {
    openTrip('en', M1)
    fireEvent.click(await action(/to Vestamager St\./, 'Show whole line'))
    act(() => openPanel(undefined))
    expect(chip('Showing: line M1 · Clear')).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(chip(/Showing/)).not.toBeInTheDocument()
  })

  it('leaves the highlight on while Esc closes the panel above it', async () => {
    openTrip('en', M1)
    fireEvent.click(await action(/to Vestamager St\./, 'Show whole line'))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(mapHighlight.get()?.label).toEqual({ kind: 'line', line: 'M1' })
  })

  it('reads Vis hele linjen, and the chip Viser: linje 5C, in Danish', async () => {
    openTrip('da', BUS)
    fireEvent.click(await action(/mod Husum Torv/, 'Vis hele linjen'))
    fireEvent.click(chip('Viser: linje 5C · Ryd')!)
    expect(mapHighlight.get()).toBeUndefined()
  })
})
