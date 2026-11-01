// The listener's route (#217) at its HTTP handler: the SIRI-ET recording's sample replayed into it
// (docs/testing-seams.md, "3. The SIRI-ET message stream"), and requests made as the tracker and
// strangers would.
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { readBox, readSiriEtMessages } from '../siri-et/recording'
import { UpdateTable } from '../siri-et/table'
import { createListener } from './listener'

const RECORDING = join(process.cwd(), 'recordings', 'siri-et')
const sample = await readSiriEtMessages(
  join(process.cwd(), 'src', 'siri-et', 'fixtures', 'sample.jsonl.gz'),
)
const box = await readBox(join(RECORDING, 'timetable'))

/** A moment on Saturday 31 October 2026, Copenhagen time (UTC+1). */
const cph = (time: string) => Date.parse(`2026-10-31T${time}+01:00`)

const TOKEN = 'a-test-token-of-the-listener-0123456789abcdef'

/** A listener whose clock reads `clock.now`, fed the sample's messages up to `until`. */
function listening(until = '09:06:53') {
  const clock = { now: cph(until) }
  const listener = createListener({
    token: TOKEN,
    version: 'test',
    startedAt: cph('09:00:00'),
    now: () => clock.now,
  })
  const feed = (to: string) => {
    for (const message of sample) {
      if (message.receivedAt > clock.now && message.receivedAt <= cph(to)) {
        listener.receive(message)
      }
    }
    clock.now = cph(to)
  }
  for (const message of sample) if (message.receivedAt <= clock.now) listener.receive(message)
  return { listener, clock, feed }
}

/** A request to the listener, with `token` as its bearer token when given. */
const request = (path: string, token?: string, init: RequestInit = {}) =>
  new Request(`https://listener.example${path}`, {
    ...init,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  })

/** The table a 200 answer carries, gunzipped and decoded with the schema. */
async function tableOf(answer: Response) {
  const json = gunzipSync(Buffer.from(await answer.arrayBuffer())).toString('utf8')
  return Schema.decodeUnknownSync(UpdateTable)(JSON.parse(json))
}

describe('the listener’s table route', () => {
  it('refuses a request with no token, a wrong one or another scheme: 401, no body', async () => {
    const { listener } = listening()
    listener.useBox(box)
    for (const refused of [
      request('/table'),
      request('/table', 'wrong'),
      request('/table', `${TOKEN}x`),
      request('/table', TOKEN.slice(1)),
      new Request('https://listener.example/table', {
        headers: { authorization: `Basic ${TOKEN}` },
      }),
    ]) {
      const answer = listener.handle(refused)
      expect(answer.status).toBe(401)
      expect(await answer.text()).toBe('')
    }
  })

  it('answers 503 with no body until it has the box’s stops and a first table', async () => {
    const { listener } = listening()
    const before = listener.handle(request('/table', TOKEN))
    expect(before.status).toBe(503)
    expect(await before.text()).toBe('')
    listener.useBox(box)
    expect(listener.handle(request('/table', TOKEN)).status).toBe(200)
  })

  it('serves the reader’s table, gzipped and versioned, with its heartbeat', async () => {
    const { listener } = listening()
    listener.useBox(box)
    const answer = listener.handle(request('/table', TOKEN))
    expect(answer.status).toBe(200)
    expect(answer.headers.get('content-type')).toBe('application/json')
    expect(answer.headers.get('content-encoding')).toBe('gzip')
    expect(answer.headers.get('cache-control')).toBe('no-store')
    const table = await tableOf(answer)
    expect(table).toMatchObject({
      version: 1,
      // The heartbeat: when it was built, and the last message's time.
      writtenAt: cph('09:06:53'),
      // The sample's last message by then, 31 ms after IC 50118's of 09:06:52.363.
      lastMessageAt: Date.parse('2026-10-31T08:06:52.394Z'),
      listener: { version: 'test', startedAt: cph('09:00:00') },
      timetableVersion: box.timetableVersion,
    })
    // IC 50118, 9 min late from 8600501 (src/siri-et/reader.test.ts).
    expect(table.journeys.find((j) => j.journey === '50118-8600096500000')?.steps).toContainEqual({
      stop: '8600501',
      aimed: cph('09:05'),
      delay: 540,
    })
  })

  it('builds the table at most once a minute, and serves it between', async () => {
    const { listener, feed } = listening('09:00:00')
    listener.useBox(box)
    const first = await tableOf(listener.handle(request('/table', TOKEN)))
    // IC 50118's first message, at 09:00:29, comes within the minute and waits for the next build.
    feed('09:00:59')
    const cached = await tableOf(listener.handle(request('/table', TOKEN)))
    expect(cached).toEqual(first)
    expect(cached.journeys.some((j) => j.journey === '50118-8600096500000')).toBe(false)
    feed('09:01:00')
    const next = await tableOf(listener.handle(request('/table', TOKEN)))
    expect(next.writtenAt).toBe(cph('09:01:00'))
    expect(next.journeys.some((j) => j.journey === '50118-8600096500000')).toBe(true)
  })

  it('exposes nothing else: any other path or method is 404 with no body', async () => {
    const { listener } = listening()
    listener.useBox(box)
    for (const other of [
      request('/', TOKEN),
      request('/table/', TOKEN),
      request('/tables', TOKEN),
      request('/table?x=1', TOKEN, { method: 'POST' }),
      request('/.env'),
      request('/health', TOKEN, { method: 'DELETE' }),
    ]) {
      const answer = listener.handle(other)
      expect(answer.status).toBe(404)
      expect(await answer.text()).toBe('')
    }
  })

  it('says only “starting” or “ok” on its health route, without the token', async () => {
    const { listener } = listening()
    const starting = listener.handle(request('/health'))
    expect([starting.status, await starting.text()]).toEqual([200, 'starting'])
    listener.useBox(box)
    const ok = listener.handle(request('/health'))
    expect([ok.status, await ok.text()]).toEqual([200, 'ok'])
  })
})

describe('the listener’s minute line', () => {
  it('counts each dataset’s messages and bytes, the table, and requests served or refused', () => {
    const { listener, feed } = listening('09:00:00')
    listener.useBox(box)
    listener.minute()
    feed('09:01:00')
    listener.handle(request('/table', TOKEN))
    listener.handle(request('/table', TOKEN))
    listener.handle(request('/table', 'wrong'))
    const due = sample.filter(
      (m) => m.receivedAt > cph('09:00:00') && m.receivedAt <= cph('09:01:00'),
    )
    const line = listener.minute()
    expect(line.datasets).toEqual(
      Object.fromEntries(
        [...new Set(due.map((m) => m.dataset))].map((dataset) => {
          const of = due.filter((m) => m.dataset === dataset)
          const bytes = of.reduce((sum, m) => sum + Buffer.byteLength(m.body), 0)
          return [dataset, { messages: of.length, bytes }]
        }),
      ),
    )
    expect(line).toMatchObject({
      requests: { served: 2, refused: 1, unavailable: 0 },
      parseFailures: { malformed: 0, tooLarge: 0, skippedJourneys: 0 },
      timetableVersion: box.timetableVersion,
    })
    expect(line.held).toBeGreaterThan(0)
    expect(line.journeys).toBeGreaterThan(0)
    expect(line.tableBytes).toBeGreaterThan(0)
    // Counted afresh each minute.
    expect(listener.minute()).toMatchObject({
      datasets: {},
      requests: { served: 0, refused: 0, unavailable: 0 },
    })
  })

  it('counts a malformed message as a parse failure', () => {
    const { listener, clock } = listening('09:00:00')
    listener.useBox(box)
    listener.minute()
    const [first] = sample
    listener.receive({ ...first, body: first.body.slice(0, first.body.length / 2) })
    clock.now += 60_000
    expect(listener.minute().parseFailures).toEqual({
      malformed: 1,
      tooLarge: 0,
      skippedJourneys: 0,
    })
  })

  it('counts a message skipped unread as too large', () => {
    const { listener, clock } = listening('09:00:00')
    listener.useBox(box)
    listener.minute()
    listener.receive({ dataset: '788', receivedAt: cph('09:00:00'), tooLarge: true })
    clock.now += 60_000
    const line = listener.minute()
    expect(line.datasets).toEqual({ '788': { messages: 1, bytes: 0 } })
    expect(line.parseFailures).toEqual({ malformed: 0, tooLarge: 1, skippedJourneys: 0 })
  })
})
