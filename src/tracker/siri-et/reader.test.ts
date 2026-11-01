// The SIRI-ET reader at the message stream (docs/testing-seams.md): a sample of the recording in
// recordings/siri-et, cut to seven journeys by scripts/siri-et/sample-siri-et.mjs, replayed in
// order, and the update table asked for at chosen moments. Every expected delay is read off the
// messages by hand: each call's expected time minus its aimed time.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBox, readSiriEtMessages, type SiriEtMessage } from './recording'
import { siriEtReader, type ReaderLimits } from './reader'
import type { UpdateTable } from './table'

const RECORDING = join(process.cwd(), 'recordings', 'siri-et')
const sample = await readSiriEtMessages(join(import.meta.dirname, 'fixtures', 'sample.jsonl.gz'))
const box = await readBox(join(RECORDING, 'timetable'))

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
})
