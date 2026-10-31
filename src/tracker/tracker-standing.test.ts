import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { clockMoment, clockTime } from '../timetable/time'
import { stopDeparturesFrom, type SnapshotDelays } from './answers'
import { pacing } from './budget'
import type { History } from './build'
import * as Http from './http'
import type { DepartureBoardAnswer } from './rejseplanen/answers'
import { callsKey } from './rejseplanen/client'
import { keyPrefixOf, timetableDirOf, trackerLayer } from './runtime'
import type { SnapshotTrip } from './snapshot'
import { readSource } from './source'
import { simulatedClient } from './simulation/layer'
import { Store } from './store'
import { fixtureTimetable } from './testing'
import { loadTimetable } from './timetable'
import { Tracker } from './tracker'

// The trips standing at a stop's platforms now (docs/screens.md, "Stop panel"), worked out from
// the stop's calls in the timetable and the snapshot, on the weekday recording from 07:20 in
// Copenhagen on Tuesday 2026-06-16. The recording's one departure board is København Syd St.'s,
// asked at 07:22, so every other stop there answers from the timetable plus the snapshot's
// delays; a board in hand elsewhere is the simulation's, and an order the fixture never shows is
// a snapshot made by hand.
const timetable = await fixtureTimetable()
const recording = readSource('recording:weekday')

const onTheRecording = trackerLayer({ timetable, source: recording, positionMode: 'CALC_REPORT' })

const ZONE = 'Europe/Copenhagen'

/** A moment on the recording's day, by its Copenhagen clock time. */
const at = (hours: number, minutes: number, seconds = 0) =>
  Date.UTC(2026, 5, 16, hours - 2, minutes, seconds)

const standingAt = (stopId: string) =>
  Effect.gen(function* () {
    return (yield* (yield* Tracker).getStopDepartures(stopId))!.standing
  })

const tripDetail = (tripKey: string) =>
  Effect.gen(function* () {
    return (yield* (yield* Tracker).getTripDetail(tripKey))!
  })

/** What the tracker's history remembers of a trip, as its last run stored it. */
const remembered = (tripKey: string) =>
  Effect.gen(function* () {
    const history = (yield* (yield* Store).get(`${keyPrefixOf(recording)}:history`)) as
      History | undefined
    return history?.[tripKey]
  })

/** A trip as the snapshot draws it, or undefined when it is not on the map. */
const onTheMap = (tripKey: string) =>
  Effect.gen(function* () {
    const { trips } = yield* (yield* Tracker).getSnapshot
    return trips.find((trip) => trip.key === tripKey)
  })

/** Refshaleøen, where the 991 from 07:00 stands from 07:17 to 07:23 by its timetable. */
const REFSHALEOEN = '48645'
const BUS_991_0700 = 'bus.991.7ce514fd98.20260616.0700'

/** Orientkaj St., where the 991 from 07:30 starts, and so stands Waiting from 07:25. */
const ORIENTKAJ = '54307'
const BUS_991_0730 = 'bus.991.7ce514fd98.20260616.0730'

/** Hillerød St., where the A from Hundige at 07:07 ends, at 08:11 by its timetable. */
const HILLEROD = '8600683'
const A_0707 = 's-tog.A.0bc307e3eb.20260616.0707'

/** København Syd St., where the RE to Næstved stands from 07:22 to 07:23 on the recording. */
const KOBENHAVN_SYD = '8600783'

/** Nørreport St., which the recording has no board for. */
const NORREPORT = '27532'

/** Bella Center St., where M1 stands from 07:22 to 07:23; Vestamager St., where it ends at 07:26. */
const BELLA_CENTER = '8603313'
const VESTAMAGER = '8603317'

/**
 * København H, where S-tog stand a minute at a track the board names: the E to Køge from 07:31
 * to 07:32 by its timetable, and the A to Hillerød from 07:32 to 07:33.
 */
const KOBENHAVN_H = '8600626'
const E_0702 = 's-tog.E.e8dc141a28.20260616.0702'

describe('the trips standing at a stop', () => {
  it.effect('lists a bus standing at the stop between its arrival and its departure', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(at(7, 21))
      expect(yield* standingAt(REFSHALEOEN)).toEqual([
        expect.objectContaining({
          trip: BUS_991_0700,
          line: '991',
          mode: 'bus',
          headsign: 'Teglholmen',
          scheduled: at(7, 23),
        }),
      ])
    }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect('counts a trip Waiting at its first stop here, in the minutes before it leaves', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(at(7, 24, 30))
      expect(yield* standingAt(ORIENTKAJ)).toEqual([])
      yield* TestClock.setTime(at(7, 25, 30))
      expect(yield* standingAt(ORIENTKAJ)).toEqual([
        expect.objectContaining({ trip: BUS_991_0730, scheduled: at(7, 30), departs: at(7, 30) }),
      ])
    }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect(
    'keeps a late trip that ends here for 2 minutes after its delayed arrival, Estimated, then drops it',
    () =>
      Effect.gen(function* () {
        // Its panel's expected arrival at its last stop, and its delay, while it is underway.
        yield* TestClock.setTime(at(8, 0))
        const arrives = (yield* tripDetail(A_0707)).calls.at(-1)!.expectedArrival!
        expect(arrives).toBeGreaterThan(at(8, 11))
        const { delay } = (yield* onTheMap(A_0707))!
        expect(delay).toBe((arrives - at(8, 11)) / 1000)
        yield* TestClock.setTime(arrives - 30_000)
        expect(yield* standingAt(HILLEROD)).toEqual([])
        yield* TestClock.setTime(arrives)
        const [ended] = yield* standingAt(HILLEROD)
        expect(ended).toMatchObject({ trip: A_0707, line: 'A', ends: true, state: 'estimated' })
        expect(ended).not.toHaveProperty('departs')
        // A run after it arrived has taken it off the map; the history keeps its delay, so it
        // still stands at its delayed arrival, Estimated.
        yield* TestClock.setTime(arrives + 119_000)
        expect(yield* onTheMap(A_0707)).toBeUndefined()
        expect((yield* remembered(A_0707))?.delay).toBe(delay)
        expect(yield* standingAt(HILLEROD)).toEqual([
          expect.objectContaining({ trip: A_0707, ends: true, state: 'estimated' }),
        ])
        yield* TestClock.setTime(arrives + 120_000)
        expect(yield* standingAt(HILLEROD)).toEqual([])
        // The next run, past the 2 minutes, forgets it.
        yield* TestClock.adjust('1 minute')
        expect(yield* standingAt(HILLEROD)).toEqual([])
        expect(yield* remembered(A_0707)).toBeUndefined()
      }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect('shows the track of the train standing at the stop the recording has a board for', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(at(7, 22, 30))
      const tracker = yield* Tracker
      const answer = (yield* tracker.getStopDepartures(KOBENHAVN_SYD))!
      expect(answer.source.kind).toBe('rejseplanen')
      expect(answer.standing).toEqual([
        expect.objectContaining({
          line: 'RE',
          headsign: 'Næstved St.',
          track: expect.stringMatching(/^[1-8]$/),
          departs: at(7, 23),
        }),
      ])
      // Any other stop has no board on the recording, and answers from the timetable.
      expect((yield* tracker.getStopDepartures(NORREPORT))!.source).toEqual({ kind: 'timetable' })
    }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect('never lists the Metro, standing, Waiting or ending', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(at(7, 22, 30))
      expect(yield* standingAt(BELLA_CENTER)).toEqual([])
      yield* TestClock.setTime(at(7, 26, 30))
      expect(yield* standingAt(VESTAMAGER)).toEqual([])
    }).pipe(Effect.provide(onTheRecording)),
  )
})

// The crowded recording: a timetable made by hand from the fixture's trains, which holds six of
// them at København H's platforms at once, on a weekday with no delay, from 07:20 in Copenhagen
// on the same Tuesday (recordings/crowded, scripts/timetable/fixtures/gtfs-crowded).
const crowded = readSource('recording:crowded')
const onTheCrowdedRecording = trackerLayer({
  timetable: await loadTimetable(timetableDirOf(crowded)),
  source: crowded,
})

describe('the trips standing at a stop, on the crowded recording', () => {
  it.effect('lists all six trains standing at København H at once, soonest to leave first', () =>
    Effect.gen(function* () {
      for (const moment of [at(7, 20), at(7, 22), at(7, 23, 59)]) {
        yield* TestClock.setTime(moment)
        const standing = yield* standingAt(KOBENHAVN_H)
        expect(standing.map(({ line, headsign, departs }) => [line, headsign, departs])).toEqual([
          ['RE', 'Næstved St.', at(7, 24)],
          ['A', 'Hundige St.', at(7, 25)],
          ['A', 'Hillerød St.', at(7, 26)],
          ['E', 'Køge St.', at(7, 27)],
          ['E', 'Holte St.', at(7, 28)],
          ['A', 'Hillerød St.', at(7, 29)],
        ])
      }
      // The RE to Næstved leaves at 07:24, and five stand on.
      yield* TestClock.setTime(at(7, 24))
      expect(yield* standingAt(KOBENHAVN_H)).toHaveLength(5)
    }).pipe(Effect.provide(onTheCrowdedRecording)),
  )
})

describe('the trips standing at a stop, by hand', () => {
  const snapshot = (moment: number, trips: readonly Partial<SnapshotTrip>[]): SnapshotDelays => ({
    fetched: moment,
    nextDue: moment + 60_000,
    trips: trips as SnapshotTrip[],
  })

  it('orders them by the departure each one shows, soonest first', () => {
    // The E 90 s late, so it leaves at 07:33:30, after the A on time at 07:33.
    const moment = at(7, 32, 40)
    const answer = stopDeparturesFrom(
      timetable,
      snapshot(moment, [
        { key: E_0702, state: 'estimated', delay: 90 },
        { key: A_0707, state: 'estimated', delay: 0 },
      ]),
      KOBENHAVN_H,
    )!
    expect(answer.standing.map(({ trip, departs }) => [trip, departs])).toEqual([
      [A_0707, at(7, 33)],
      [E_0702, at(7, 33, 30)],
    ])
  })
})

const simulated = readSource('simulated')
const prefix = keyPrefixOf(simulated)

/** The month's calls so far of one service, from the store's counter. */
const callsTo = (service: 'multiDepartureBoard' | 'journeyDetail') =>
  Effect.gen(function* () {
    const calls = yield* (yield* Store).get(callsKey(prefix, '2026-06', service))
    return typeof calls === 'number' ? calls : 0
  })

/**
 * The simulated Rejseplanen, its departure boards putting the S-tog to Køge 90 s behind the
 * timetable at track 5, where its positions have it a minute late.
 */
const boardSaysOtherwise = (() => {
  const simulation = simulatedClient({ timetable })
  return Http.layer(
    Http.client((request, url) =>
      Effect.gen(function* () {
        const response = yield* simulation.execute(request)
        if (!url.pathname.endsWith('multiDepartureBoard')) return response
        const answer = (yield* response.json) as DepartureBoardAnswer
        const Departure = answer.Departure?.map((departure) => {
          if (departure.direction !== 'Køge St.') return departure
          const planned = clockMoment(departure.date, departure.time, ZONE)!
          const late = clockTime(planned + 90_000, ZONE, { seconds: true })
          return { ...departure, rtTime: late, rtTrack: '5' }
        })
        return Http.json(request, 200, { ...answer, Departure })
      }).pipe(Effect.orDie),
    ),
  )
})()

describe('the trips standing at a stop, with its board in hand', () => {
  const onTheSimulation = (http?: typeof boardSaysOtherwise) =>
    trackerLayer({
      timetable,
      source: simulated,
      positionMode: 'CALC_REPORT',
      ...(http ? { http } : {}),
    })

  it.effect('shows the board’s expected time and track over the snapshot’s', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(at(7, 32, 45))
      const answer = (yield* (yield* Tracker).getStopDepartures(KOBENHAVN_H))!
      expect(answer.source.kind).toBe('rejseplanen')
      expect(answer.standing).toEqual([
        expect.objectContaining({
          line: 'E',
          headsign: 'Køge St.',
          track: '5',
          scheduled: at(7, 32),
          expected: at(7, 33, 30),
          departs: at(7, 33, 30),
          state: 'estimated',
        }),
      ])
    }).pipe(Effect.provide(onTheSimulation(boardSaysOtherwise))),
  )

  it.effect('spends no call of its own beside the stop’s one board call', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(at(7, 32, 30))
      const answer = (yield* (yield* Tracker).getStopDepartures(KOBENHAVN_H))!
      expect(answer.standing.map(({ line, track }) => [line, track])).toEqual([['E', '8']])
      expect(yield* callsTo('multiDepartureBoard')).toBe(1)
      expect(yield* callsTo('journeyDetail')).toBe(0)
    }).pipe(Effect.provide(onTheSimulation())),
  )

  it.effect('is there when on-demand calls are stopped, and spends none', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(at(7, 32, 30))
      // 50 calls under the line: normal, but inside the cushion of 100, so no on-demand calls.
      const pace = pacing({ calls: 0, now: at(7, 32, 30), timezone: ZONE })
      yield* (yield* Store).set(callsKey(prefix, '2026-06'), Math.ceil(pace.line) - 50)
      const answer = (yield* (yield* Tracker).getStopDepartures(KOBENHAVN_H))!
      expect(answer.source).toEqual({ kind: 'timetable' })
      expect(answer.standing.map(({ line, departs }) => [line, departs])).toEqual([
        ['E', at(7, 33)],
      ])
      expect(yield* callsTo('multiDepartureBoard')).toBe(0)
      expect(yield* callsTo('journeyDetail')).toBe(0)
    }).pipe(Effect.provide(onTheSimulation())),
  )
})
