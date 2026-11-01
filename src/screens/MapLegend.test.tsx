import { act, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveAircraft } from '../map/aircraft'
import { liveSnapshot } from '../map/live'
import { mapView } from '../map/view'
import type { AircraftSnapshot } from '../tracker/aircraft/index'
import type { Snapshot } from '../tracker/index'
import { MapLegend } from './MapLegend'
import { Providers } from './Providers'

const saved = (recording: string, name: string): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', recording, 'snapshots', name), 'utf8'),
  ) as Snapshot

// Every recording so far alternates the modes. The first day with the key may leave Mylder on
// CALC_REPORT alone: the same minute, as the tracker would then say it.
const alternating = saved('weekday', '0006.json')
const calcOnly: Snapshot = { ...alternating, positionMode: 'CALC_REPORT', answerMode: undefined }
const reportOnly: Snapshot = { ...alternating, positionMode: 'REPORT_ONLY', answerMode: undefined }

function show(lang: Lang, snapshot?: Snapshot) {
  liveSnapshot.update({ snapshot, clockOffset: 0 })
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapLegend />
    </Providers>,
  )
}

/** The weekday recording's first aircraft snapshot, as the aircraft route answers it. */
const aircraft = JSON.parse(
  readFileSync(
    join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', '0001.json'),
    'utf8',
  ),
) as AircraftSnapshot

/** 15:42 in Copenhagen, summer time, when the feed last answered. */
const LAST_ANSWER = Date.UTC(2026, 5, 16, 13, 42, 10)

/** The aircraft feed failing since a minute after its last answer. */
const failing: AircraftSnapshot = {
  ...aircraft,
  fetched: LAST_ANSWER + 90_000,
  nextDue: LAST_ANSWER + 100_000,
  health: { status: 'error', kind: 'timeout', since: LAST_ANSWER + 10_000 },
  lastAnswer: LAST_ANSWER,
}

afterEach(() => {
  liveSnapshot.update({ snapshot: undefined })
  liveAircraft.update({ snapshot: undefined })
  mapView.update({ aircraftHidden: false })
})

const NO_LIVE_EN = 'No vehicle can be Live: Rejseplanen sends only estimated positions.'
const NO_LIVE_DA = 'Intet køretøj kan være Live: Rejseplanen sender kun beregnede positioner.'

describe("the map's legend", () => {
  it('names the five data states in their order, in English', () => {
    show('en', alternating)
    const legend = screen.getByRole('list', { name: 'Data states' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Live', 'Ageing', 'Estimated', 'Timetable only', 'No signal'])
  })

  it('names them in Danish', () => {
    show('da', alternating)
    const legend = screen.getByRole('list', { name: 'Datatilstande' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Live', 'Ældre', 'Beregnet', 'Kun køreplan', 'Intet signal'])
  })

  it('names the planes after the five states while the planes are on the map, in English', () => {
    liveAircraft.update({ snapshot: aircraft })
    show('en', alternating)
    const legend = screen.getByRole('list', { name: 'Data states' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Live', 'Ageing', 'Estimated', 'Timetable only', 'No signal', 'Planes'])
  })

  it('names them in Danish', () => {
    liveAircraft.update({ snapshot: aircraft })
    show('da', alternating)
    const legend = screen.getByRole('list', { name: 'Datatilstande' })
    expect(within(legend).getAllByRole('listitem').at(-1)).toHaveTextContent('Fly')
  })

  it('leaves the planes out before their feed answers, and while the Planes filter hides them', () => {
    show('en', alternating)
    const legend = screen.getByRole('list', { name: 'Data states' })
    expect(within(legend).queryByText('Planes')).not.toBeInTheDocument()
    act(() => liveAircraft.update({ snapshot: aircraft }))
    expect(within(legend).getByText('Planes')).toBeInTheDocument()
    act(() => mapView.update({ aircraftHidden: true }))
    expect(within(legend).queryByText('Planes')).not.toBeInTheDocument()
  })

  it('says once that no vehicle can be Live while Mylder asks for CALC_REPORT alone', () => {
    show('en', calcOnly)
    expect(screen.getAllByText(NO_LIVE_EN)).toHaveLength(1)
  })

  it('says it in Danish', () => {
    show('da', calcOnly)
    expect(screen.getAllByText(NO_LIVE_DA)).toHaveLength(1)
  })

  it('says nothing of it in any other mode, or before the first snapshot', () => {
    show('en')
    expect(screen.queryByText(NO_LIVE_EN)).not.toBeInTheDocument()
    for (const snapshot of [alternating, reportOnly]) {
      act(() => liveSnapshot.update({ snapshot }))
      expect(screen.queryByText(NO_LIVE_EN)).not.toBeInTheDocument()
    }
    act(() => liveSnapshot.update({ snapshot: calcOnly }))
    expect(screen.getByText(NO_LIVE_EN)).toBeInTheDocument()
  })

  describe('on the timetable source', () => {
    const onTimetable = saved('timetable-source', '0006.json')
    const ON_TIMETABLE_EN =
      "Every vehicle is Timetable only for now: live positions aren't connected yet."
    const ON_TIMETABLE_DA =
      'Alle køretøjer er Kun køreplan indtil videre: der er endnu ingen livepositioner.'

    it('says once that every vehicle is placed from the timetable for now, in English', () => {
      show('en', onTimetable)
      expect(screen.getAllByText(ON_TIMETABLE_EN)).toHaveLength(1)
      // Its position mode is none, not CALC_REPORT: no call is made at all.
      expect(screen.queryByText(NO_LIVE_EN)).not.toBeInTheDocument()
    })

    it('says it in Danish', () => {
      show('da', onTimetable)
      expect(screen.getAllByText(ON_TIMETABLE_DA)).toHaveLength(1)
    })

    it('says nothing of it on any other source', () => {
      show('en', alternating)
      expect(screen.queryByText(ON_TIMETABLE_EN)).not.toBeInTheDocument()
      for (const kind of ['simulated', 'recording', 'rejseplanen'] as const) {
        act(() => liveSnapshot.update({ snapshot: { ...onTimetable, source: { kind } } }))
        expect(screen.queryByText(ON_TIMETABLE_EN)).not.toBeInTheDocument()
      }
    })
  })

  it("says since when the planes' feed has had no data while it fails, in English", () => {
    liveAircraft.update({ snapshot: failing })
    show('en', alternating)
    expect(screen.getByText('Planes: no data since 15:42')).toBeInTheDocument()
    act(() =>
      liveAircraft.update({
        snapshot: { ...aircraft, health: { status: 'ok', since: LAST_ANSWER + 100_000 } },
      }),
    )
    expect(screen.queryByText(/no data since/)).not.toBeInTheDocument()
  })

  it('says it in Danish', () => {
    liveAircraft.update({ snapshot: failing })
    show('da', alternating)
    expect(screen.getByText('Fly: ingen data siden 15:42')).toBeInTheDocument()
  })

  it('counts from the first failure when the feed has never answered', () => {
    const { lastAnswer: _, ...never } = failing
    liveAircraft.update({ snapshot: never })
    show('en', alternating)
    expect(screen.getByText('Planes: no data since 15:42')).toBeInTheDocument()
  })

  it('says nothing of the planes while their feed answers, they are off, or hidden', () => {
    show('en', alternating)
    expect(screen.queryByText(/Planes:/)).not.toBeInTheDocument()
    act(() => liveAircraft.update({ snapshot: aircraft }))
    expect(screen.queryByText(/Planes:/)).not.toBeInTheDocument()
    act(() => {
      liveAircraft.update({ snapshot: failing })
      mapView.update({ aircraftHidden: true })
    })
    expect(screen.queryByText(/Planes:/)).not.toBeInTheDocument()
  })
})
