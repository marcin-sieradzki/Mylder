import '@mylder/perron/tokens.css'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { liveSnapshot } from '../map/live'
import { timetableRoutesOf } from '../test/timetableRoutes'
import type { Snapshot } from '../tracker/index'
import { aboutDialog } from './about'
import { AboutDialog } from './AboutDialog'
import { MapCredit } from './MapCredit'
import { MapScreen } from './MapScreen'
import { Providers } from './Providers'

// SIRI-ET's delays in City pulse, About and the credits (docs/screens.md; spec #146, #215): the
// timetable source with `MYLDER_UPDATES=recording:siri-et`, saved in recordings/siri-et, its second
// minute, 09:22:00 in Copenhagen on Saturday 31 October 2026, the delays' last message at 09:21:52.
// Of its 589 trips on the map, 406 are Estimated, each with its delay at its next call, a mean of
// +1.06 min; 344 of its 408 buses, 28 of its 32 S-trains and 34 of its 81 trains have an update,
// and SIRI-ET carries no light rail or Metro. Read off the snapshot's trips.
const folder = join(process.cwd(), 'recordings', 'siri-et')
const minute2 = JSON.parse(readFileSync(join(folder, 'snapshots/0002.json'), 'utf8')) as Snapshot

/** The same minute with the delays switched off, as `MYLDER_UPDATES` unset leaves them. */
const delaysOff: Snapshot = {
  ...minute2,
  updates: { kind: 'off', fresh: false, withUpdate: {}, unmatched: {} },
}

/** Opens the page in `lang` on City pulse, the server's clock `after` ms past the snapshot's fetch. */
function openPulse(lang: Lang, snapshot: Snapshot = minute2, after = 0) {
  vi.setSystemTime(snapshot.fetched + after)
  act(() => liveSnapshot.update({ snapshot, clockOffset: 0 }))
  window.history.replaceState(null, '', `/${lang}`)
  return render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapScreen />
    </Providers>,
  )
}

/** Shows the corner credit and opens the About dialog named `name`, in `lang`. */
function openAbout(lang: Lang, name: string, snapshot: Snapshot = minute2) {
  vi.setSystemTime(snapshot.fetched)
  act(() => liveSnapshot.update({ snapshot, clockOffset: 0 }))
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapCredit />
      <AboutDialog />
    </Providers>,
  )
  act(() => aboutDialog.open())
  return screen.getByRole('dialog', { name })
}

const panel = () => within(screen.getByRole('dialog')).getByRole('tabpanel')
const figure = (name: string) => within(panel()).getByRole('group', { name })
const region = (name: string) => within(panel()).getByRole('region', { name })
const meterIn = (section: HTMLElement, name: string) => within(section).getByRole('meter', { name })
/** A meter's line, under it. */
const meterLine = (section: HTMLElement, name: string) =>
  meterIn(section, name).parentElement!.parentElement!.textContent

/** A fact of About's status list, by its name. */
const fact = (dialog: HTMLElement, name: string) =>
  within(dialog).getByText(name, { selector: 'dt' }).nextElementSibling?.textContent

/** The corner credit. */
const credit = () =>
  screen.getByText((_, element) => element?.classList.contains('pn-Attribution') ?? false)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // jsdom has no server: the timetable's routes answer from the recording's files.
  vi.stubGlobal('fetch', timetableRoutesOf('siri-et'))
})

afterEach(() => {
  act(() => aboutDialog.close())
  act(() => liveSnapshot.update({ snapshot: undefined, clockOffset: 0 }))
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("City pulse with SIRI-ET's delays", () => {
  const NO_LIVE = 'No live positions yet; placed from the timetable'

  it('gives the average delay of the vehicles with one', () => {
    openPulse('en')
    expect(figure('Average delay')).toHaveTextContent(
      /^Average delay\+1\.1min, vehicles with a known delay, Metro left out$/,
    )
    expect(within(panel()).queryByRole('group', { name: 'Reporting live' })).toBeNull()
  })

  it('says what share of each mode’s vehicles have an update with delays', () => {
    openPulse('en')
    const shares = region('With delays, by mode')
    expect(meterIn(shares, 'Bus')).toHaveAttribute('aria-valuenow', String((344 / 408) * 100))
    expect(meterLine(shares, 'Bus')).toContain('344/408 · Movia')
    expect(meterLine(shares, 'S-tog')).toContain('28/32 · DSB')
    expect(meterLine(shares, 'Train')).toContain('34/81 · DSB')
    // SIRI-ET carries neither the light rail nor the Metro: "—", not a red 0 %.
    expect(meterIn(shares, 'Light rail')).toHaveAttribute('aria-valuetext', 'Unknown')
    expect(meterIn(shares, 'Light rail')).toHaveAttribute('data-color', 'neutral')
    expect(meterLine(shares, 'Light rail')).toContain(
      'Rejseplanen sends no delays for this mode; placed from the timetable',
    )
    expect(meterIn(shares, 'Metro')).toHaveAttribute('aria-valuetext', 'Unknown')
    expect(meterLine(shares, 'Metro')).toContain(
      'No realtime from the Metro; placed from the timetable',
    )
  })

  it('keeps the shares while the feed is quiet and the trips with an update are No signal', () => {
    // Six minutes past the delays' last message, at 09:21:52, the feed is no longer fresh.
    openPulse('en', minute2, minute2.updates.lastMessage! + 6 * 60_000 - minute2.fetched)
    const key = within(panel()).getByRole('list', { name: 'How sure are we?' })
    expect(
      within(key)
        .getAllByRole('listitem')
        .find((item) => item.textContent?.startsWith('No signal')),
    ).toHaveTextContent(/^No signal [1-9]/)
    expect(meterLine(region('With delays, by mode'), 'Bus')).toContain('344/408 · Movia')
  })

  it('keeps saying no live positions are connected yet where a figure needs them', () => {
    openPulse('en')
    expect(figure('Reported this minute')).toHaveTextContent(NO_LIVE)
    const positions = region('Reporting live, by mode')
    for (const mode of ['Bus', 'S-tog', 'Train', 'Light rail']) {
      expect(meterIn(positions, mode)).toHaveAttribute('aria-valuetext', 'Unknown')
      expect(meterLine(positions, mode)).toContain(NO_LIVE)
    }
  })

  it('says it in Danish', () => {
    openPulse('da')
    expect(figure('Gennemsnitlig forsinkelse')).toHaveTextContent(
      /^Gennemsnitlig forsinkelse\+1,1min, køretøjer med kendt forsinkelse, Metro udeladt$/,
    )
    const shares = region('Med forsinkelser, efter transportform')
    expect(meterLine(shares, 'Bus')).toContain('344/408 · Movia')
    expect(meterLine(shares, 'Tog')).toContain('34/81 · DSB')
    expect(meterLine(shares, 'Letbane')).toContain(
      'Rejseplanen sender ingen forsinkelser for denne transportform; placeret efter køreplanen',
    )
    expect(meterLine(shares, 'Metro')).toContain(
      'Ingen realtid fra Metroen; placeret efter køreplanen',
    )
    const NO_LIVE_DA = 'Ingen livepositioner endnu; placeret efter køreplanen'
    expect(figure('Meldt i dette minut')).toHaveTextContent(NO_LIVE_DA)
    expect(meterLine(region('Melder live, efter transportform'), 'Bus')).toContain(NO_LIVE_DA)
  })

  it('leaves the delays out when they are off', () => {
    openPulse('en', delaysOff)
    expect(within(panel()).queryByRole('group', { name: 'Average delay' })).toBeNull()
    expect(figure('Reporting live')).toHaveTextContent(NO_LIVE)
    expect(within(panel()).queryByRole('region', { name: 'With delays, by mode' })).toBeNull()
  })
})

describe("About and the credits with SIRI-ET's delays", () => {
  const COMPANY = 'Rejsekort & Rejseplan A/S'

  it('names the delays as a source with their latest update, and credits them', () => {
    const dialog = openAbout('en', 'About Mylder')
    expect(fact(dialog, 'Delays')).toBe("Rejseplanen's SIRI-ET, updated 09:21:52")
    expect(dialog).toHaveTextContent(
      `Delays and cancellations: ${COMPANY}, through Rejseplanen's SIRI-ET.`,
    )
    expect(credit()).toHaveTextContent(
      `Transit data: Rejseplanen (CC BY 4.0) · Delays: ${COMPANY} · © OpenStreetMap contributors`,
    )
  })

  it('says it in Danish', () => {
    const dialog = openAbout('da', 'Om Mylder')
    expect(fact(dialog, 'Forsinkelser')).toBe('Rejseplanens SIRI-ET, opdateret 09:21:52')
    expect(dialog).toHaveTextContent(
      `Forsinkelser og aflysninger: ${COMPANY}, via Rejseplanens SIRI-ET.`,
    )
    expect(credit()).toHaveTextContent(
      `Trafikdata: Rejseplanen (CC BY 4.0) · Forsinkelser: ${COMPANY} · © OpenStreetMap-bidragydere`,
    )
  })

  it('says no update has come yet before the first message, in English and Danish', () => {
    const { lastMessage: _, ...waiting } = minute2.updates
    const before: Snapshot = { ...minute2, updates: waiting }
    expect(fact(openAbout('en', 'About Mylder', before), 'Delays')).toBe(
      "Rejseplanen's SIRI-ET, no update yet",
    )
    act(() => aboutDialog.close())
    cleanup()
    expect(fact(openAbout('da', 'Om Mylder', before), 'Forsinkelser')).toBe(
      'Rejseplanens SIRI-ET, ingen opdatering endnu',
    )
  })

  it('names neither when the delays are off', () => {
    const dialog = openAbout('en', 'About Mylder', delaysOff)
    expect(within(dialog).queryByText('Delays', { selector: 'dt' })).toBeNull()
    expect(dialog).not.toHaveTextContent(COMPANY)
    expect(credit()).not.toHaveTextContent(COMPANY)
  })
})
