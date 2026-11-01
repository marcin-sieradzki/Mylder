// The SIRI-ET reader at the message stream (docs/testing-seams.md): a sample of the recording in
// recordings/siri-et, cut to seven journeys by scripts/siri-et/sample-siri-et.mjs, replayed in
// order, and the update table asked for at chosen moments. Every expected delay is read off the
// messages by hand: each call's expected time minus its aimed time.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBox, readSiriEtMessages, type SiriEtMessage } from './recording'
import { siriEtReader, type ReaderLimits } from './reader'
import type { TableJourney, UpdateTable } from './table'

const RECORDING = join(process.cwd(), 'recordings', 'siri-et')
const sample = await readSiriEtMessages(join(import.meta.dirname, 'fixtures', 'sample.jsonl.gz'))
const box = await readBox(join(RECORDING, 'timetable'))
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

  it('drops a journey 10 minutes after its last call', () => {
    // Bus 68 reached Kigkurren (3155) at 09:43, a minute early, as its message of 09:43:47 says.
    expect(
      journey(replayed('09:56:08').table(cph('09:52:59')), '6800119-8601705300000'),
    ).toBeDefined()
    const reader = replayed('09:56:08')
    const table = reader.table(cph('09:53:00'))
    expect(journey(table, '6800119-8601705300000')).toBeUndefined()
    expect(table.held).toBe(replayed('09:56:08').table(cph('09:52:59')).held - 1)
  })

  it("drops a journey with no calls once its service day is over, and doesn't take it back", () => {
    // The 950R's cancellation with its calls taken out: nothing says when it ends.
    const [cancellation] = sample.filter((m) => m.body.includes('106044-8605418300001'))
    const noCalls = {
      ...cancellation,
      body: cancellation.body.replace(/<EstimatedCalls>.*<\/EstimatedCalls>/, ''),
    }
    const reader = siriEtReader({ box, listener: LISTENER })
    reader.receive(noCalls)
    // Saturday's trips may still run until Monday starts, past Sunday's last night bus.
    expect(
      journey(reader.table(Date.parse('2026-11-01T22:59:59Z')), '106044-8605418300001'),
    ).toMatchObject({ cancelled: true })
    expect(reader.table(Date.parse('2026-11-01T23:00:00Z')).held).toBe(0)
    reader.receive({ ...noCalls, receivedAt: Date.parse('2026-11-01T23:00:01Z') })
    expect(reader.table(Date.parse('2026-11-01T23:00:02Z')).held).toBe(0)
  })
})
