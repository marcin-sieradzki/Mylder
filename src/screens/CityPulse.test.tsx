import '@mylder/perron/tokens.css'
import { act, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveSnapshot } from '../map/live'
import type { Snapshot } from '../tracker/index'
import { CityPulse } from './CityPulse'
import { Providers } from './Providers'

/** A saved snapshot of a recording: the weekday's unless another is named. */
const saved = (name: string, recording = 'weekday'): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', recording, 'snapshots', name), 'utf8'),
  ) as Snapshot

// The sixth minute, a REPORT_ONLY answer at 07:25:00 in Copenhagen. Of the 13 trips underway
// outside the Metro, 7 reported: 1 of 6 buses, 5 of 6 S-trains and the 1 regional train. The 4
// Metro trains are Timetable only, and a seventh bus waits at its first stop. 13 trips carry a
// delay, under the 20 an average needs.
const MINUTE_6 = '0006.json'

/** Lands `snapshot` with the server's clock `seconds` past its fetch, and renders City pulse. */
function renderPulse(lang: Lang, snapshot: Snapshot, seconds = 20) {
  vi.setSystemTime(snapshot.fetched + seconds * 1000)
  act(() => liveSnapshot.update({ snapshot, clockOffset: 0 }))
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <CityPulse />
    </Providers>,
  )
}

/** A key figure, by its label. */
const figure = (name: string) => screen.getByRole('group', { name })

/** A meter as a screen reader reads it: its name and its value. */
const read = (meter: HTMLElement) =>
  `${document.getElementById(meter.getAttribute('aria-labelledby')!)?.textContent} ${meter.getAttribute('aria-valuetext')}`

/** A mode's meter and the line under it, by the mode's name. */
const meter = (name: string) => screen.getByRole('meter', { name }).parentElement!

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  window.history.replaceState(null, '', '/en')
})

afterEach(() => {
  liveSnapshot.update({ snapshot: undefined })
  vi.useRealTimers()
})

describe('Reported this minute', () => {
  it('counts the vehicles the latest report answer carried', () => {
    renderPulse('en', saved(MINUTE_6))
    expect(figure('Reported this minute')).toHaveTextContent(
      /^Reported this minute7vehicles that reported their position$/,
    )
  })

  it('shows "—" and says why when Rejseplanen sends computed positions only', () => {
    // The first minute's answer was a CALC_REPORT one, as every answer is in that mode.
    renderPulse('en', { ...saved('0001.json'), positionMode: 'CALC_REPORT' })
    expect(figure('Reported this minute')).toHaveTextContent('—')
    expect(figure('Reported this minute')).toHaveTextContent(
      'Rejseplanen sends computed positions only',
    )
  })

  it('says it in Danish', () => {
    renderPulse('da', { ...saved('0001.json'), positionMode: 'CALC_REPORT' })
    expect(figure('Meldt i dette minut')).toHaveTextContent(
      'Rejseplanen sender kun beregnede positioner',
    )
  })

  it('turns "—" once the API has failed past the Live limit, with no poll', () => {
    // The API has failed since a minute before this snapshot's answer, so positions pause at the
    // Live limit, 240 s, from then: 180 s after the answer, while every dot keeps its state.
    const snapshot = saved(MINUTE_6)
    renderPulse('en', { ...snapshot, api: { status: 'error', since: snapshot.fetched - 60_000 } })
    expect(figure('Reported this minute')).toHaveTextContent(/^Reported this minute7/)
    act(() => vi.advanceTimersByTime(150_000))
    expect(figure('Reported this minute')).toHaveTextContent(/^Reported this minute7/)
    act(() => vi.advanceTimersByTime(20_000))
    expect(figure('Reported this minute')).toHaveTextContent('Positions are paused')
  })

  it('shows "—" while positions are paused', () => {
    renderPulse('en', saved('0001.json', 'spent'))
    expect(figure('Reported this minute')).toHaveTextContent('—')
    expect(figure('Reported this minute')).toHaveTextContent('Positions are paused')
  })
})

describe('the third figure', () => {
  it('is Reporting live while under 20 vehicles carry a delay', () => {
    renderPulse('en', saved(MINUTE_6))
    expect(screen.queryByRole('group', { name: 'Average delay' })).not.toBeInTheDocument()
    expect(figure('Reporting live')).toHaveTextContent(
      /^Reporting live54%7 of 13 vehicles that could report$/,
    )
  })

  it('says it in Danish', () => {
    renderPulse('da', saved(MINUTE_6))
    expect(figure('Melder live')).toHaveTextContent(
      /^Melder live54\s%7 af 13 køretøjer, der kunne melde$/,
    )
  })

  it('is the average delay once 20 or more vehicles carry one, the Metro left out', () => {
    // A bigger city than the fixture's: the sixth minute's 13 trips with a delay, three times
    // over, with keys of their own. Their mean is 101.5 s.
    const snapshot = saved(MINUTE_6)
    const delayed = snapshot.trips.filter((trip) => trip.delay !== undefined)
    const city = {
      ...snapshot,
      trips: [
        ...snapshot.trips,
        ...[1, 2].flatMap((copy) =>
          delayed.map((trip) => ({ ...trip, key: `${trip.key}+${copy}` })),
        ),
      ],
    }
    renderPulse('en', city)
    expect(figure('Average delay')).toHaveTextContent(
      /^Average delay\+1\.7min, vehicles with a known delay, Metro left out$/,
    )
  })

  it('writes the delay as Danish does', () => {
    const snapshot = saved(MINUTE_6)
    const early = snapshot.trips.map((trip) =>
      trip.delay === undefined ? trip : { ...trip, delay: -90 },
    )
    const city = {
      ...snapshot,
      trips: [...early, ...early.map((trip) => ({ ...trip, key: `${trip.key}+1` }))],
    }
    renderPulse('da', city)
    expect(figure('Gennemsnitlig forsinkelse')).toHaveTextContent('−1,5')
  })

  it('shows "—" and says why when Rejseplanen sends computed positions only', () => {
    renderPulse('en', { ...saved('0001.json'), positionMode: 'CALC_REPORT' })
    expect(figure('Reporting live')).toHaveTextContent('—')
    expect(figure('Reporting live')).toHaveTextContent('Rejseplanen sends computed positions only')
  })
})

describe('Reporting live, by mode', () => {
  it("shows each mode's share of its vehicles underway, coloured by threshold, with its operator", () => {
    renderPulse('en', saved(MINUTE_6))
    const modes = screen.getByRole('region', { name: 'Reporting live, by mode' })
    expect(within(modes).getAllByRole('meter').map(read)).toEqual([
      'Bus 17%',
      'Metro Unknown',
      'S-tog 83%',
      'Train 100%',
    ])
    expect(meter('Bus')).toHaveTextContent('1/6 · Movia')
    expect(screen.getByRole('meter', { name: 'Bus' })).toHaveAttribute('data-color', 'danger')
    expect(meter('S-tog')).toHaveTextContent('5/6 · DSB')
    expect(screen.getByRole('meter', { name: 'S-tog' })).toHaveAttribute('data-color', 'success')
  })

  it('reads "—" for the Metro, which sends no realtime, not 0 % in red', () => {
    renderPulse('en', saved(MINUTE_6))
    expect(screen.getByRole('meter', { name: 'Metro' })).toHaveAttribute(
      'aria-valuetext',
      'Unknown',
    )
    expect(screen.getByRole('meter', { name: 'Metro' })).toHaveAttribute('data-color', 'neutral')
    expect(meter('Metro')).toHaveTextContent(
      'No realtime from the Metro; placed from the timetable',
    )
  })

  it('says it in Danish', () => {
    renderPulse('da', saved(MINUTE_6))
    expect(meter('Metro')).toHaveTextContent(
      'Ingen realtid fra Metroen; placeret ud fra køreplanen',
    )
    expect(meter('Tog')).toHaveTextContent('1/1 · DSB')
  })

  it('reads "—" for every mode when every position is computed', () => {
    renderPulse('en', { ...saved('0001.json'), positionMode: 'CALC_REPORT' })
    for (const mode of ['Bus', 'S-tog', 'Train']) {
      expect(screen.getByRole('meter', { name: mode })).toHaveAttribute('aria-valuetext', 'Unknown')
      expect(meter(mode)).toHaveTextContent('Every position is computed by Rejseplanen')
    }
  })

  it('follows the mode filters', () => {
    window.history.replaceState(null, '', '/en?hide=bus,metro')
    renderPulse('en', saved(MINUTE_6))
    const modes = screen.getByRole('region', { name: 'Reporting live, by mode' })
    expect(within(modes).getAllByRole('meter').map(read)).toEqual(['S-tog 83%', 'Train 100%'])
    expect(figure('Reported this minute')).toHaveTextContent('6')
    expect(figure('Reporting live')).toHaveTextContent('6 of 7 vehicles that could report')
  })
})

describe('How sure are we?', () => {
  it("counts the trips on the map in each state, each with Mylder's sentence", () => {
    renderPulse('en', saved(MINUTE_6))
    const key = screen.getByRole('list', { name: 'How sure are we?' })
    const items = within(key).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Live 7 Reported by the vehicle in the latest answers.',
      'Ageing 0 Last reported a few minutes ago; moving on along its path since.',
      'Estimated 6 Placed from the timetable and a known delay, or computed by Rejseplanen.',
      'Timetable only 5 No realtime for this trip today; placed from the timetable.',
      'No signal 0 Had realtime, missing for 5 min; moving on the timetable and its last delay.',
    ])
  })

  it('ages its counts with the dots, with no poll', () => {
    renderPulse('en', saved(MINUTE_6))
    const key = () => screen.getByRole('list', { name: 'How sure are we?' })
    const count = (state: string) =>
      within(key())
        .getAllByRole('listitem')
        .find((item) => item.textContent?.startsWith(state))
        ?.textContent?.match(/^\D+ (\d+) /)?.[1]
    expect(count('Live')).toBe('7')
    // The modes alternate, so reports come every 120 s, and the Live limit, 2.5 of those capped at
    // 4 min, passes 240 s after the answer.
    act(() => vi.advanceTimersByTime(230_000))
    expect(count('Live')).toBe('0')
    expect(count('Ageing')).toBe('7')
    expect(figure('Reported this minute')).toHaveTextContent(/^Reported this minute0/)
  })

  it('says it in Danish', () => {
    renderPulse('da', saved(MINUTE_6))
    expect(screen.getByRole('list', { name: 'Hvor sikre er vi?' })).toHaveTextContent(
      'Meldt af køretøjet i de seneste svar.',
    )
  })
})

describe('the budget line', () => {
  it('heads City pulse when the poll has stretched', () => {
    renderPulse('en', {
      ...saved(MINUTE_6),
      pollInterval: 90,
      budget: { level: 'stretched', calls: 30_000 },
    })
    expect(
      screen.getByText('Updating every 90 s to stay within the data budget.'),
    ).toBeInTheDocument()
  })

  it('says minutes in Danish from 2 min', () => {
    renderPulse('da', {
      ...saved(MINUTE_6),
      pollInterval: 120,
      budget: { level: 'tight', calls: 40_000 },
    })
    expect(
      screen.getByText('Kortet opdateres hvert 2. minut for at overholde databudgettet.'),
    ).toBeInTheDocument()
  })

  it('is absent while the budget is normal', () => {
    renderPulse('en', saved(MINUTE_6))
    expect(screen.queryByText(/data budget/)).not.toBeInTheDocument()
  })
})
