import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { pacing } from './budget'
import { TestClock } from 'effect/testing'
import type { Service } from './rejseplanen/answers'
import { callsKey } from './rejseplanen/client'
import { keyPrefixOf, trackerLayer } from './runtime'
import { readSource } from './source'
import { Store } from './store'
import { fixtureTimetable } from './testing'
import { Tracker } from './tracker'

// A stop's arrivals (docs/screens.md, "Stop panel"; docs/live-data.md, "The budget"): the trips
// arriving at its platforms in the next 30 minutes, from one `multiArrivalBoard` call for the
// stop's platforms when the budget allows it, cached a minute, else from the timetable plus the
// snapshot's delays, on the weekday recording from 07:20 in Copenhagen on Tuesday 2026-06-16. The
// recording keeps one stop's arrival board, København Syd St.'s, asked at 07:22; any other stop's
// call fails, as an unknown call to Rejseplanen does.
const timetable = await fixtureTimetable()
const recording = readSource('recording:weekday')
const prefix = keyPrefixOf(recording)

// As the recording was frozen: its position mode, and a run each minute from 07:20.
const onTheRecording = trackerLayer({ timetable, source: recording })

/** A moment on the recording's day, by its Copenhagen clock time. */
const at = (hours: number, minutes: number, seconds = 0) =>
  Date.UTC(2026, 5, 16, hours - 2, minutes, seconds)

/** The recording played a run a minute from its start at 07:20 to `minutes` past 7. */
const playTo = (minutes: number) =>
  Effect.gen(function* () {
    const tracker = yield* Tracker
    for (let minute = 20; minute <= minutes; minute++) {
      yield* TestClock.setTime(at(7, minute))
      yield* tracker.getSnapshot
    }
  })

const arrivalsAt = (stopId: string) =>
  Effect.gen(function* () {
    return yield* (yield* Tracker).getStopArrivals(stopId)
  })

/** The month's calls to one service so far, from the store's counter. */
const callsTo = (service: Service) =>
  Effect.gen(function* () {
    const calls = yield* (yield* Store).get(callsKey(prefix, '2026-06', service))
    return typeof calls === 'number' ? calls : 0
  })

/** København Syd St., whose arrival board the recording keeps, asked at 07:22. */
const KOBENHAVN_SYD = '8600783'

/** Nørreport St., where buses and S-tog arrive in the next half hour. */
const NORREPORT = '27532'

/** Refshaleøen, where the 991 from 07:30 arrives at 07:47 and leaves at 07:53. */
const REFSHALEOEN = '48645'

/** Bella Center St., where M1 towards Vestamager arrives at 07:22 and 07:26. */
const BELLA_CENTER = '8603313'

/** Vestamager St., where M1 from Vanløse ends at 07:26 and 07:30, and leaves before 07:21. */
const VESTAMAGER = '8603317'

/** Hillerød St., where the first trip to arrive, the A from Hundige, ends at 08:11. */
const HILLEROD = '8600683'

/** København H, which the recording's disruption list names. */
const KOBENHAVN_H = '8600626'

describe('the trips arriving at a stop', () => {
  it.effect(
    'lists each arriving in the next 30 minutes, where it comes from, at its timetabled arrival shifted by the snapshot’s delay',
    () =>
      Effect.gen(function* () {
        yield* playTo(21)
        const answer = (yield* arrivalsAt(NORREPORT))!
        expect(answer.stop.name).toBe('Nørreport St.')
        expect(
          answer.arrivals.map(({ line, origin, headsign, scheduled, expected, state }) => ({
            line,
            origin,
            headsign,
            scheduled,
            expected,
            state,
          })),
        ).toEqual([
          {
            line: 'E',
            origin: 'Holte St.',
            headsign: 'Køge St.',
            scheduled: at(7, 27),
            expected: at(7, 29),
            state: 'live',
          },
          {
            line: '5C',
            origin: 'Sundbyvester Plads',
            headsign: 'Husum Torv',
            scheduled: at(7, 36),
            expected: at(7, 38),
            state: 'estimated',
          },
          {
            line: '5C',
            origin: 'Herlev Hospital, Sløjfen',
            headsign: 'Sundbyvester Plads',
            scheduled: at(7, 39),
            expected: at(7, 39),
            state: 'estimated',
          },
          {
            line: 'A',
            origin: 'Hundige St.',
            headsign: 'Hillerød St.',
            scheduled: at(7, 36),
            expected: at(7, 40),
            state: 'live',
          },
          {
            line: 'A',
            origin: 'Hillerød St.',
            headsign: 'Hundige St.',
            scheduled: at(7, 39),
            expected: at(7, 41),
            state: 'live',
          },
          {
            line: '5C',
            origin: 'Sundbyvester Plads',
            headsign: 'Husum Torv',
            scheduled: at(7, 45),
            expected: at(7, 44),
            state: 'estimated',
          },
          {
            line: '5C',
            origin: 'Husum Torv, Sløjfen',
            headsign: 'Sundbyvester Plads',
            scheduled: at(7, 44),
            expected: at(7, 46),
            state: 'live',
          },
          {
            line: 'A',
            origin: 'Hundige St.',
            headsign: 'Hillerød St.',
            scheduled: at(7, 46),
            expected: at(7, 47),
            state: 'live',
          },
          {
            line: 'E',
            origin: 'Køge St.',
            headsign: 'Holte St.',
            scheduled: at(7, 48),
            expected: at(7, 49),
            state: 'estimated',
          },
          {
            line: 'A',
            origin: 'Hillerød St.',
            headsign: 'Hundige St.',
            scheduled: at(7, 49),
            expected: at(7, 51),
            state: 'live',
          },
        ])
        expect(answer.source).toEqual({ kind: 'timetable' })
        expect(answer.fetched).toBe(at(7, 21))
      }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect(
    'lists a trip at its arrival, not its departure, and leaves out one that has arrived',
    () =>
      Effect.gen(function* () {
        yield* playTo(21)
        // The 991 from 07:00 arrived at 07:17 and stands until 07:23; the one from 07:30 arrives at
        // 07:47, off the map and so Timetable only, and leaves at 07:53.
        expect((yield* arrivalsAt(REFSHALEOEN))!.arrivals).toEqual([
          {
            trip: 'bus.991.7ce514fd98.20260616.0730',
            line: '991',
            mode: 'bus',
            colour: 'perron-color-transit-mode-bus',
            origin: 'Orientkaj St.',
            headsign: 'Teglholmen',
            platform: REFSHALEOEN,
            scheduled: at(7, 47),
            state: 'timetable-only',
          },
        ])
      }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect(
    'reads the Metro’s arrivals as an interval from its planned arrivals, its last stop’s too',
    () =>
      Effect.gen(function* () {
        yield* playTo(21)
        const bellaCenter = (yield* arrivalsAt(BELLA_CENTER))!
        expect(bellaCenter.arrivals).toEqual([])
        expect(bellaCenter.intervals).toEqual([
          {
            line: 'M1',
            mode: 'metro',
            colour: 'perron-color-transit-line-m1',
            origin: 'Vanløse St.',
            headsign: 'Vestamager St. (Metro)',
            platform: BELLA_CENTER,
            every: { from: 4, to: 4 },
          },
        ])
        // M1 ends at Vestamager St. at 07:26 and 07:30; the trips that leave it left at 07:01
        // and 07:05.
        const vestamager = (yield* arrivalsAt(VESTAMAGER))!
        expect(vestamager.intervals).toEqual([
          expect.objectContaining({ line: 'M1', origin: 'Vanløse St.', every: { from: 4, to: 4 } }),
        ])
        expect((yield* (yield* Tracker).getStopDepartures(VESTAMAGER))!.intervals).toEqual([])
      }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect('lists none when nothing arrives in the next 30 minutes', () =>
    Effect.gen(function* () {
      yield* playTo(21)
      const answer = (yield* arrivalsAt(HILLEROD))!
      expect(answer.arrivals).toEqual([])
      expect(answer.intervals).toEqual([])
    }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect('carries the disruption list’s messages that name the stop', () =>
    Effect.gen(function* () {
      yield* playTo(21)
      const answer = (yield* arrivalsAt(KOBENHAVN_H))!
      expect(answer.messages.map(({ message }) => message.head)).toEqual([
        'Færre S-tog mellem København H og Hellerup',
      ])
    }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect('answers none for a stop the timetable doesn’t know', () =>
    Effect.gen(function* () {
      yield* playTo(20)
      expect(yield* arrivalsAt('nowhere')).toBeUndefined()
    }).pipe(Effect.provide(onTheRecording)),
  )
})

describe('a stop’s arrivals from its arrival board', () => {
  it.effect(
    'makes one multiArrivalBoard call for the stop, and gives its expected times and tracks',
    () =>
      Effect.gen(function* () {
        yield* playTo(22)
        const answer = (yield* arrivalsAt(KOBENHAVN_SYD))!
        expect(answer.source).toEqual({ kind: 'rejseplanen', at: at(7, 22) })
        expect(yield* callsTo('multiArrivalBoard')).toBe(1)
        expect(answer.arrivals.length).toBeGreaterThan(0)
        // The simulation gives trains a made-up track, and an expected time with their prognosis.
        const trains = answer.arrivals.filter((row) => ['s-tog', 'train'].includes(row.mode))
        expect(trains.length).toBeGreaterThan(0)
        for (const row of trains) {
          expect(row.track).toMatch(/^[1-8]$/)
          expect(row.expected).toBeDefined()
          expect(row.origin).not.toBe('København Syd St.')
        }
        // Due again when the board's minute runs out, if the snapshot isn't due sooner.
        expect(answer.nextDue).toBeLessThanOrEqual(at(7, 23))
      }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect('makes no second call when the stop’s Arrivals open again within the minute', () =>
    Effect.gen(function* () {
      yield* playTo(22)
      yield* arrivalsAt(KOBENHAVN_SYD)
      yield* TestClock.adjust('30 seconds')
      const again = (yield* arrivalsAt(KOBENHAVN_SYD))!
      expect(again.source).toEqual({ kind: 'rejseplanen', at: at(7, 22) })
      expect(yield* callsTo('multiArrivalBoard')).toBe(1)
    }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect('keeps the arrival board’s cache apart from the departure board’s', () =>
    Effect.gen(function* () {
      yield* playTo(22)
      const departures = (yield* (yield* Tracker).getStopDepartures(KOBENHAVN_SYD))!
      expect(departures.source.kind).toBe('rejseplanen')
      // Departures alone spend no arrival call.
      expect(yield* callsTo('multiArrivalBoard')).toBe(0)
      expect(yield* callsTo('multiDepartureBoard')).toBe(1)
      expect((yield* arrivalsAt(KOBENHAVN_SYD))!.source.kind).toBe('rejseplanen')
      expect(yield* callsTo('multiArrivalBoard')).toBe(1)
      expect(yield* callsTo('multiDepartureBoard')).toBe(1)
    }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect(
    'answers from the timetable with the snapshot’s delays when on-demand calls are stopped',
    () =>
      Effect.gen(function* () {
        yield* playTo(22)
        // 50 calls under the line: normal, but inside the cushion of 100.
        const { line } = pacing({ calls: 0, now: at(7, 22), timezone: 'Europe/Copenhagen' })
        yield* (yield* Store).set(callsKey(prefix, '2026-06'), Math.ceil(line) - 50)
        const answer = (yield* arrivalsAt(NORREPORT))!
        expect(answer.source).toEqual({ kind: 'timetable' })
        expect(yield* callsTo('multiArrivalBoard')).toBe(0)
        const { trips } = yield* (yield* Tracker).getSnapshot
        const late = answer.arrivals.filter((row) => row.expected !== undefined)
        expect(late.length).toBeGreaterThan(0)
        for (const row of late) {
          const trip = trips.find((each) => each.key === row.trip)!
          expect(row.expected! - row.scheduled).toBe(trip.delay! * 1000)
          expect(row.state).toBe(trip.state)
        }
      }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect('answers from the timetable with the snapshot’s delays when the call fails', () =>
    Effect.gen(function* () {
      yield* playTo(21)
      // The recording has no arrival board for Nørreport St.: Rejseplanen refuses the call.
      const answer = (yield* arrivalsAt(NORREPORT))!
      expect(answer.source).toEqual({ kind: 'timetable' })
      expect(yield* callsTo('multiArrivalBoard')).toBe(1)
      expect(answer.arrivals[0]).toMatchObject({
        line: 'E',
        origin: 'Holte St.',
        scheduled: at(7, 27),
        expected: at(7, 29),
        state: 'live',
      })
    }).pipe(Effect.provide(onTheRecording)),
  )

  it.effect('makes no call at a stop where only the Metro arrives', () =>
    Effect.gen(function* () {
      yield* playTo(21)
      const answer = (yield* arrivalsAt(BELLA_CENTER))!
      expect(answer.intervals.map(({ line }) => line)).toEqual(['M1'])
      expect(answer.source).toEqual({ kind: 'timetable' })
      expect(yield* callsTo('multiArrivalBoard')).toBe(0)
    }).pipe(Effect.provide(onTheRecording)),
  )
})
