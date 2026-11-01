// The SIRI-ET reader at the message stream (docs/testing-seams.md): a sample of the recording in
// recordings/siri-et, cut to eight journeys by scripts/siri-et/sample-siri-et.mjs, replayed in
// order, and the update table asked for at chosen moments. Every expected delay is read off the
// messages by hand: each call's expected time minus its aimed time.
import { join } from 'node:path'
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { readBox, readSiriEtMessages } from './recording'
import { siriEtReader, type ReaderLimits } from './reader'
import { UpdateTable, type TableJourney } from './table'

const RECORDING = join(process.cwd(), 'recordings', 'siri-et')
const sample = await readSiriEtMessages(join(import.meta.dirname, 'fixtures', 'sample.jsonl.gz'))
const box = await readBox(join(RECORDING, 'timetable'))
/** Bus 118's journey of 09:00, a round trip from Vanløse St. (2627) and back, cut the same way. */
const roundTrip = await readSiriEtMessages(
  join(import.meta.dirname, 'fixtures', 'round-trip.jsonl.gz'),
)
/** The box the recording was cut to, 0.05° wider on each side than the timetable's. */
const widerBox = await readBox(join(RECORDING, 'timetable'), {
  south: 55.4,
  west: 11.95,
  north: 56.1,
  east: 12.8,
})

/** A moment on Saturday 31 October 2026, Copenhagen time (UTC+1). */
const cph = (time: string) => Date.parse(`2026-10-31T${time}+01:00`)

const LISTENER = { version: 'test', startedAt: cph('09:00:00') }

/** A reader fed every sample message received up to `until`, Copenhagen time. */
function replayed(until: string, limits?: Partial<ReaderLimits>, messages = sample) {
  const reader = siriEtReader({ box, listener: LISTENER, limits })
  for (const message of messages) if (message.receivedAt <= cph(until)) reader.receive(message)
  return reader
}

const journey = (table: UpdateTable, ref: string) => table.journeys.find((j) => j.journey === ref)

/** The delay a journey's steps give a call aimed at `aimed`: the last step's at or before it. */
const delayAt = (j: TableJourney | undefined, aimed: string) =>
  j?.steps.findLast((s) => s.aimed <= cph(aimed))?.delay

/** A step: the call at `stop` aimed at `aimed`, Copenhagen time, runs `delay` seconds late. */
const step = (stop: string, aimed: string, delay: number) => ({ stop, aimed: cph(aimed), delay })

describe('the SIRI-ET reader', () => {
  it("merges a later message's calls into what it holds for the journey", () => {
    // IC 50118's messages of 09:00:29, 09:03:41 and 09:06:52: the last carries eight calls, adds
    // Ringsted (8600601) and leaves out 8600079 and 8600608, whose delays the 09:03:41 one set.
    const table = replayed('09:06:53').table(cph('09:07:00'))
    const ic = journey(table, '50118-8600096500000')
    expect(ic).toMatchObject({
      dataset: '785',
      day: '2026-10-31',
      line: '50118',
      operator: 'DSB',
      origin: '8600053',
      destination: '8600650',
      trainNumber: '50118',
      received: Date.parse('2026-10-31T08:06:52.363Z'),
    })
    expect(ic?.cancelled).toBeUndefined()
    expect(ic?.steps).toEqual([
      step('8600079', '08:56', 600),
      step('8600501', '09:05', 540),
      step('8600512', '09:29', 480),
      step('8600515', '09:38', 420),
      step('8600518', '09:47', 360),
      step('8600601', '10:00', 300),
      step('8600605', '10:10', 180),
      step('8600608', '10:19', 120),
      step('8600611', '10:29', 60),
      step('8600617', '10:46', 0),
    ])
  })

  it('lists a delay only where it changes, and a call the journey skips as cancelled', () => {
    // Bus 68's first message, a whole trip of 30 calls, 1 to 3 min early, Gyldenlandsvej (30090)
    // cancelled.
    const bus = journey(replayed('09:02:00').table(cph('09:02:00')), '6800119-8601705300000')
    expect(bus).toMatchObject({
      line: '68',
      operator: 'Movia',
      origin: '2256',
      destination: '3155',
    })
    expect(bus?.first).toEqual({ stop: '2256', aimed: cph('09:03') })
    expect(bus?.steps).toEqual([
      step('2256', '09:03', -120),
      step('226', '09:17', -60),
      step('227', '09:18', -120),
      step('3073', '09:20', -60),
      step('3076', '09:24', -120),
      step('348', '09:29', -180),
      step('3080', '09:32', -120),
      step('3007', '09:37', -60),
      step('28049', '09:40', -120),
      step('907', '09:41', -60),
      step('3153', '09:42', -120),
    ])
    expect(bus?.cancelledCalls).toEqual([{ stop: '30090', aimed: cph('09:38') }])
  })

  it("serves a cancelled call again when a later message's call no longer says so", () => {
    // Bus 68's whole trip again at 09:08:11, Gyldenlandsvej served a minute early.
    const bus = journey(replayed('09:08:12').table(cph('09:08:12')), '6800119-8601705300000')
    expect(bus?.cancelledCalls).toBeUndefined()
    expect(delayAt(bus, '09:38')).toBe(-60)
  })

  it('gives a cancelled journey with no delays or cancelled calls of its own', () => {
    // Lokaltog's 950R from Gilleleje at 10:01, cancelled in its one message, at 09:01:00.
    const table = replayed('09:05:00').table(cph('09:05:00'))
    const train = journey(table, '106044-8605418300001')
    expect(train).toMatchObject({
      dataset: '799',
      line: '950R',
      operator: 'Lokaltog A/S',
      cancelled: true,
      first: { stop: '8601403', aimed: cph('10:01') },
      steps: [],
    })
    expect(train?.cancelledCalls).toBeUndefined()
  })

  it('cancels a journey that had cancelled calls when a later message cancels it whole', () => {
    // Bus 102A from 09:04: its last two calls cancelled at 09:19:32, the whole trip at 09:21:15.
    const before = journey(replayed('09:20:00').table(cph('09:20:00')), '10200036-8605405801000')
    expect(before?.cancelled).toBeUndefined()
    expect(before?.cancelledCalls).toEqual([
      { stop: '5642', aimed: cph('09:21') },
      { stop: '8983', aimed: cph('09:22') },
    ])
    const after = journey(replayed('09:21:16').table(cph('09:21:16')), '10200036-8605405801000')
    expect(after?.cancelled).toBe(true)
  })

  it('lists only the journeys that call inside the box, and holds the rest', () => {
    // Bus 327 round Frederiksværk calls only west of the timetable's box, which starts at 12.05° E.
    const table = replayed('09:30:00').table(cph('09:30:00'))
    expect(journey(table, '32700019-8601478601000')).toBeUndefined()
    expect(table.held).toBe(8)
    expect(table.journeys.map((j) => j.journey).sort()).toEqual([
      '10200036-8605405801000',
      '106044-8605418300001',
      '186040-8605427500000',
      '50118-8600096500000',
      '613229-8602723509000',
      '621229-8602733301000',
      '6800119-8601705300000',
    ])
    const wider = siriEtReader({ box: widerBox, listener: LISTENER })
    for (const message of sample) if (message.receivedAt <= cph('09:30:00')) wider.receive(message)
    expect(journey(wider.table(cph('09:30:00')), '32700019-8601478601000')).toBeDefined()
  })

  it('counts a journey in the box by its first or last stop, when no message carries that call', () => {
    // Lokaltog's 940R starts at Grønnehave (8601606), inside the box, and its messages carry only
    // calls north of it, from Skibstrup on.
    const table = replayed('09:05:00').table(cph('09:05:00'))
    expect(journey(table, '186040-8605427500000')).toMatchObject({
      origin: '8601606',
      first: { stop: '8601627', aimed: cph('09:00') },
    })
  })

  it('drops a journey 10 minutes after its last call, when that call is at its last stop', () => {
    // Bus 68 reached Kigkurren (3155), its DestinationRef, at 09:43, a minute early, as its
    // message of 09:43:47 says.
    expect(
      journey(replayed('09:56:08').table(cph('09:52:59')), '6800119-8601705300000'),
    ).toBeDefined()
    const reader = replayed('09:56:08')
    const table = reader.table(cph('09:53:00'))
    expect(journey(table, '6800119-8601705300000')).toBeUndefined()
    expect(table.held).toBe(replayed('09:56:08').table(cph('09:52:59')).held - 1)
  })

  it('keeps a journey heard only through calls short of its last stop, and their delays', () => {
    // IC 50118's first message, at 09:00:04, carries only its call at 8600079, due away at 08:56
    // and gone on time; its last stop, 8600650, is in none of its messages.
    const reader = replayed('09:00:05')
    const table = reader.table(cph('09:30:00'))
    expect(journey(table, '50118-8600096500000')).toMatchObject({
      first: { stop: '8600079', aimed: cph('08:56') },
      steps: [step('8600079', '08:56', 0)],
    })
  })

  it('ends a round trip at its arrival back where it started, not at its departure from there', () => {
    // Bus 118's last message, of 09:39:24: it left Vanløse St. (2627) at 09:00 and was back at
    // 09:39.
    const ref = '11800009-8600981704000'
    const whole = siriEtReader({ box, listener: LISTENER })
    for (const message of roundTrip) whole.receive(message)
    expect(journey(whole.table(cph('09:48:59')), ref)).toBeDefined()
    expect(journey(whole.table(cph('09:49:00')), ref)).toBeUndefined()
    // The same message with its first call alone, the departure from Vanløse St.
    const last = roundTrip[roundTrip.length - 1]
    const departureOnly = siriEtReader({ box, listener: LISTENER })
    departureOnly.receive({
      ...last,
      body: last.body
        .replace(
          /<\/RecordedCall><RecordedCall>.*<\/RecordedCalls>/,
          '</RecordedCall></RecordedCalls>',
        )
        .replace(/<EstimatedCalls>.*<\/EstimatedCalls>/, ''),
    })
    expect(journey(departureOnly.table(cph('09:30:00')), ref)).toMatchObject({
      first: { stop: '2627', aimed: cph('09:00') },
    })
    // Its first message, of 09:00:03, with its last call alone: due back at 09:37, at 09:35.
    const arrivalOnly = siriEtReader({ box, listener: LISTENER })
    arrivalOnly.receive({
      ...roundTrip[0],
      body: roundTrip[0].body.replace(
        /<EstimatedCalls>.*(<EstimatedCall><StopPointRef>2627<)/,
        '<EstimatedCalls>$1',
      ),
    })
    expect(journey(arrivalOnly.table(cph('09:44:59')), ref)).toBeDefined()
    expect(journey(arrivalOnly.table(cph('09:45:00')), ref)).toBeUndefined()
  })

  it('drops a journey of a service day that has ended, and refuses it after', () => {
    // IC 50118 after its first message, still short of its last stop. Saturday's service day
    // starts at its midnight and runs at most 36 hours, so it has ended at noon on Sunday.
    const first = sample.find((m) => m.body.includes('50118-8600096500000'))!
    const reader = replayed('09:00:05')
    const sunday = (time: string) => Date.parse(`2026-11-01T${time}+01:00`)
    expect(journey(reader.table(sunday('11:59:59')), '50118-8600096500000')).toBeDefined()
    expect(reader.table(sunday('12:00:00')).held).toBe(0)
    reader.receive({ ...first, receivedAt: sunday('12:00:01') })
    expect(reader.table(sunday('12:00:02')).held).toBe(0)
  })

  it('drops a journey with no calls once its service day has ended', () => {
    // The 950R's cancellation with its calls taken out: nothing says when it ends.
    const [cancellation] = sample.filter((m) => m.body.includes('106044-8605418300001'))
    const reader = siriEtReader({ box, listener: LISTENER })
    reader.receive({
      ...cancellation,
      body: cancellation.body.replace(/<EstimatedCalls>.*<\/EstimatedCalls>/, ''),
    })
    expect(
      journey(reader.table(Date.parse('2026-11-01T11:59:59+01:00')), '106044-8605418300001'),
    ).toMatchObject({ cancelled: true })
    expect(reader.table(Date.parse('2026-11-01T12:00:00+01:00')).held).toBe(0)
  })

  it("counts each dataset's messages and the journeys they carry", () => {
    const table = replayed('09:56:08').table(cph('09:56:08'))
    expect(table.datasets).toEqual({
      '785': counts(69, 69, '2026-10-31T08:54:45.492Z'),
      '788': counts(61, 68, '2026-10-31T08:43:47.591Z'),
      '799': counts(23, 23, '2026-10-31T08:30:33.467Z'),
      '801': counts(47, 49, '2026-10-31T08:54:57.743Z'),
    })
    expect(table.lastMessageAt).toBe(Date.parse('2026-10-31T08:54:57.743Z'))
    expect(table).toMatchObject({
      version: 1,
      writtenAt: cph('09:56:08'),
      listener: LISTENER,
      timetableVersion: '2026-11-01-6495dcc6',
      evicted: 0,
    })
  })

  it('counts and skips a malformed message, and reads the next', () => {
    const [first, second] = sample.filter((m) => m.dataset === '785')
    const reader = siriEtReader({ box, listener: LISTENER })
    reader.receive({ ...first, body: first.body.slice(0, first.body.length / 2) })
    // Its text with every tag taken out, so no XML at all.
    reader.receive({ ...first, body: first.body.replace(/<[^>]*>/g, ' ') })
    reader.receive({
      ...first,
      body: first.body.replace('<Siri ', '<Other ').replace('</Siri>', '</Other>'),
    })
    expect(reader.table(cph('09:01:00'))).toMatchObject({
      datasets: { '785': { messages: 3, malformed: 3, journeyUpdates: 0 } },
      held: 0,
    })
    reader.receive(second)
    expect(reader.table(cph('09:01:00'))).toMatchObject({
      datasets: { '785': { messages: 4, malformed: 3, journeyUpdates: 1 } },
      held: 1,
    })
  })

  it("counts and skips a journey that lacks an identifying part, and reads the message's others", () => {
    // Bus 68's message of 09:32:23 carries bus 327's journey too.
    const both = sample.find((m) => m.receivedAt === Date.parse('2026-10-31T08:32:23.782Z'))!
    expect(both.body.match(/<EstimatedVehicleJourney>/g)).toHaveLength(2)
    const reader = siriEtReader({ box, listener: LISTENER })
    reader.receive({
      ...both,
      body: both.body.replace(/<LineRef>68<\/LineRef>/, ''),
    })
    const table = reader.table(cph('09:32:30'))
    expect(table.datasets['788']).toMatchObject({ skippedJourneys: 1, journeyUpdates: 1 })
    expect(table.held).toBe(1)
    expect(journey(table, '6800119-8601705300000')).toBeUndefined()
  })

  it("counts and skips a journey whose service day isn't a date", () => {
    const both = sample.find((m) => m.receivedAt === Date.parse('2026-10-31T08:32:23.782Z'))!
    const reader = siriEtReader({ box, listener: LISTENER })
    reader.receive({
      ...both,
      // Bus 68's journey comes second, so its DataFrameRef is the last one in the body.
      body: both.body.replace(
        /<DataFrameRef>2026-10-31<\/DataFrameRef>(?![\s\S]*<DataFrameRef>)/,
        '<DataFrameRef>31-10-2026</DataFrameRef>',
      ),
    })
    const table = reader.table(cph('09:32:30'))
    expect(table.datasets['788']).toMatchObject({ skippedJourneys: 1, journeyUpdates: 1 })
    expect(journey(table, '6800119-8601705300000')).toBeUndefined()
  })

  it('skips a message over the size limit', () => {
    const table = replayed('09:56:08', { messageChars: 18_000 }).table(cph('09:56:08'))
    // Two S-tog messages, of 18,081 and 22,040 characters, and one of Movia's, 19,438.
    expect(table.datasets['801']).toMatchObject({ messages: 47, tooLarge: 2 })
    expect(table.datasets['788']).toMatchObject({ messages: 61, tooLarge: 1 })
  })

  it('holds no more journeys than its cap, dropping the one updated longest ago', () => {
    // In the recording's wider box, so every journey held is listed.
    const fed = (limits?: Partial<ReaderLimits>) => {
      const reader = siriEtReader({ box: widerBox, listener: LISTENER, limits })
      for (const message of sample)
        if (message.receivedAt <= cph('09:30:00')) reader.receive(message)
      return reader.table(cph('09:30:00'))
    }
    const capped = fed({ journeys: 3 })
    expect(capped.held).toBe(3)
    // At least the five over the cap, and again each time one comes back.
    expect(capped.evicted).toBeGreaterThanOrEqual(5)
    const latest = [...fed().journeys].sort((a, b) => b.received - a.received).slice(0, 3)
    expect(capped.journeys.map((j) => j.journey).sort()).toEqual(
      latest.map((j) => j.journey).sort(),
    )
  })

  it('gives a table the schema decodes, and refuses one of another version', () => {
    const table = replayed('09:30:00').table(cph('09:30:00'))
    const written = JSON.stringify(Schema.encodeSync(UpdateTable)(table))
    expect(Schema.decodeUnknownSync(UpdateTable)(JSON.parse(written))).toEqual(table)
    expect(() => Schema.decodeUnknownSync(UpdateTable)({ ...table, version: 2 })).toThrow(
      /\["version"\]/,
    )
  })

  it('holds messages received before it has a box, and lists them once it has one', () => {
    // The listener receives from its first second, before it has the box's stops from the app.
    const reader = siriEtReader({ listener: LISTENER })
    for (const message of sample) if (message.receivedAt <= cph('09:06:53')) reader.receive(message)
    reader.useBox(box)
    expect(reader.table(cph('09:07:00'))).toEqual(replayed('09:06:53').table(cph('09:07:00')))
  })

  it('lists by the stops of the box it was last given, keeping every journey held', () => {
    // A timetable version whose box holds only IC 50118's stop at Ringsted (8600601), which none
    // of the other sample journeys call at.
    const reader = replayed('09:06:53')
    reader.useBox({ ...box, stops: new Set(['8600601']), timetableVersion: 'next' })
    const narrow = reader.table(cph('09:07:00'))
    expect(narrow.timetableVersion).toBe('next')
    expect(narrow.journeys.map((j) => j.journey)).toEqual(['50118-8600096500000'])
    reader.useBox(box)
    expect(reader.table(cph('09:07:00'))).toEqual(replayed('09:06:53').table(cph('09:07:00')))
  })
})

/** A dataset's counts with every message read. */
function counts(messages: number, journeyUpdates: number, last: string) {
  return {
    lastMessageAt: Date.parse(last),
    messages,
    journeyUpdates,
    malformed: 0,
    tooLarge: 0,
    skippedJourneys: 0,
  }
}
