// The listener's loop (#217): its datasets' links on a fake `Connect` in place of the AMQP shell,
// which no test reaches (docs/testing-seams.md), Entra ID and the app as a stub `fetch`, and the
// SIRI-ET recording's sample as the messages, on Vitest's fake clock.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiriEtMessage } from '../siri-et/reader'
import { readSiriEtMessages } from '../siri-et/recording'
import type { LogLine } from './log'
import {
  type Connect,
  type DatasetAddress,
  type LinkEvents,
  type ListenerConfig,
  startListener,
} from './run'

const TIMETABLE = join(process.cwd(), 'recordings', 'siri-et', 'timetable')
const manifest = JSON.parse(await readFile(join(TIMETABLE, 'manifest.json'), 'utf8'))
const stops = JSON.parse(await readFile(join(TIMETABLE, manifest.files.stops), 'utf8'))
const sample = await readSiriEtMessages(
  join(process.cwd(), 'src', 'siri-et', 'fixtures', 'sample.jsonl.gz'),
)

/** A moment on Saturday 31 October 2026, Copenhagen time (UTC+1). */
const cph = (time: string) => Date.parse(`2026-10-31T${time}+01:00`)

/** Fake credentials, each one distinct enough to find in any line. */
const SECRET = 'fake-secret-7f3a9c2e'
const CLIENT_ID = 'fake-client-5b1d8e40'
const TENANT_ID = 'fake-tenant-0c6f2a91'
const TOKEN = 'fake-updates-token-4e8b6d1f0a2c3e5f'
const SUBSCRIPTION = 'fake-subscription-9d2b7c13'
const address = (dataset: string): DatasetAddress => ({
  host: 'broker.example',
  topic: `t-distribution-${dataset}`,
  subscription: SUBSCRIPTION,
  dataset,
})
const config: ListenerConfig = {
  clientId: CLIENT_ID,
  tenantId: TENANT_ID,
  secret: SECRET,
  datasets: [address('788'), address('785')],
  token: TOKEN,
  appUrl: 'https://mylder.example',
  port: 0,
}
/** Every credential, and every access token Entra ID gives out (`jwt-<n>`). */
const SECRETS = [SECRET, CLIENT_ID, TENANT_ID, TOKEN, SUBSCRIPTION, 'jwt-']

interface FakeLink {
  readonly dataset: string
  readonly clientId: string
  readonly token: string
  readonly events: LinkEvents
  readonly renewed: string[]
  closed: boolean
}

/** Entra ID and the app, answering as they would, and what each was sent. */
function stubs() {
  const sent = { tokens: [] as string[], app: [] as string[] }
  const stub = { entraUp: true }
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url === `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`) {
      sent.tokens.push(String(init?.body))
      if (!stub.entraUp) {
        // Even an answer that echoes what it was sent never reaches a line.
        return Response.json(
          { error: 'invalid_client', error_description: `bad ${CLIENT_ID} ${SECRET}` },
          { status: 401 },
        )
      }
      return Response.json({ access_token: `jwt-${sent.tokens.length}`, expires_in: 3599 })
    }
    sent.app.push(url)
    if (url === 'https://mylder.example/api/timetable') return Response.json(manifest)
    if (url === `https://mylder.example/api/timetable/${manifest.version}/stops`) {
      return Response.json(stops)
    }
    return new Response(null, { status: 404 })
  }) as typeof globalThis.fetch
  return { fetch, sent, stub }
}

/** The listener started on the fake links, with every line it logs. */
function started() {
  const links: FakeLink[] = []
  const connect: Connect = (address, clientId, token, events) => {
    const link: FakeLink = {
      dataset: address.dataset,
      clientId,
      token,
      events,
      renewed: [],
      closed: false,
    }
    links.push(link)
    return {
      renew: (jwt) => link.renewed.push(jwt),
      close: () => {
        link.closed = true
      },
    }
  }
  const lines: LogLine[] = []
  const { fetch, sent, stub } = stubs()
  const running = startListener({
    config,
    connect,
    fetch,
    log: (line) => lines.push(line),
    version: 'test',
  })
  const open = (dataset: string) => links.filter((l) => l.dataset === dataset && !l.closed)
  const opened = (dataset: string) => links.filter((l) => l.dataset === dataset)
  /** Delivers a message on its dataset's open link. */
  const deliver = (message: SiriEtMessage) =>
    open(message.dataset).at(-1)?.events.onMessage(message)
  const table = (token = TOKEN) =>
    running.listener.handle(
      new Request('https://listener.example/table', {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
  return { running, links, open, opened, lines, sent, stub, deliver, table }
}

/** Lets the token's and the app's answers come in. */
const settle = () => vi.advanceTimersByTimeAsync(0)

let stop: (() => void) | undefined
beforeEach(() => {
  vi.useFakeTimers({ now: cph('09:00:00') })
})
afterEach(() => {
  stop?.()
  stop = undefined
  vi.useRealTimers()
})

/** Starts the listener for a test, and stops it after. */
function run() {
  const listener = started()
  stop = listener.running.stop
  return listener
}

describe('the listener’s loop', () => {
  it('signs each dataset in with an Entra ID token and hands its messages to the reader', async () => {
    const { links, sent, deliver, table } = run()
    await settle()
    expect(links.map((l) => [l.dataset, l.clientId, l.token])).toEqual([
      ['788', CLIENT_ID, 'jwt-1'],
      ['785', CLIENT_ID, 'jwt-1'],
    ])
    expect(Object.fromEntries(new URLSearchParams(sent.tokens[0]))).toEqual({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: SECRET,
      scope: 'https://servicebus.azure.net/.default',
    })
    for (const link of links) link.events.onOpen()
    for (const message of sample) if (message.receivedAt <= cph('09:06:53')) deliver(message)
    vi.setSystemTime(cph('09:06:53'))
    const answer = table()
    expect(answer.status).toBe(200)
    const served = JSON.parse(gunzipSync(Buffer.from(await answer.arrayBuffer())).toString())
    expect(served.journeys.map((j: { journey: string }) => j.journey)).toContain(
      '50118-8600096500000',
    )
  })

  it('serves 503 until the app gives it the box’s stops', async () => {
    const { table } = run()
    expect(table().status).toBe(503)
    await settle()
    expect(table().status).toBe(200)
  })

  it('puts a new token on every link every 15 minutes', async () => {
    // At night, when a quiet feed is left alone.
    vi.setSystemTime(cph('02:00:00'))
    const { links } = run()
    await settle()
    for (const link of links) link.events.onOpen()
    await vi.advanceTimersByTimeAsync(15 * 60_000)
    expect(links.map((l) => l.renewed)).toEqual([['jwt-2'], ['jwt-2']])
    await vi.advanceTimersByTimeAsync(15 * 60_000)
    expect(links.map((l) => l.renewed)).toEqual([
      ['jwt-2', 'jwt-3'],
      ['jwt-2', 'jwt-3'],
    ])
  })

  it('reconnects a closed link with exponential backoff, from the start once it listens', async () => {
    const { opened } = run()
    await settle()
    const closeLatest = () => opened('788').at(-1)!.events.onClose('it was disconnected')
    const reopenedAfter = async (ms: number) => {
      const before = opened('788').length
      await vi.advanceTimersByTimeAsync(ms - 1)
      expect(opened('788')).toHaveLength(before)
      await vi.advanceTimersByTimeAsync(1)
      expect(opened('788')).toHaveLength(before + 1)
    }
    closeLatest()
    await reopenedAfter(1_000)
    closeLatest()
    await reopenedAfter(2_000)
    closeLatest()
    await reopenedAfter(4_000)
    opened('788').at(-1)!.events.onOpen()
    closeLatest()
    await reopenedAfter(1_000)
    // The other dataset's link is untouched.
    expect(opened('785')).toHaveLength(1)
  })

  it('backs off to at most 2 minutes', async () => {
    vi.setSystemTime(cph('02:00:00'))
    const { opened } = run()
    await settle()
    for (let i = 0; i < 10; i++) {
      opened('788').at(-1)!.events.onClose('it was disconnected')
      await vi.advanceTimersByTimeAsync(120_000)
    }
    expect(opened('788')).toHaveLength(11)
  })

  it('reconnects every link after 5 minutes with no message from any dataset in service hours', async () => {
    const { links, opened, deliver } = run()
    await settle()
    for (const link of links) link.events.onOpen()
    deliver(sample[0])
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(links.filter((l) => l.closed)).toHaveLength(0)
    // A message on one dataset keeps both links.
    deliver({ ...sample[0], dataset: '785' })
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(links.filter((l) => l.closed)).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(links.filter((l) => l.closed).map((l) => l.dataset)).toEqual(['788', '785'])
    expect(opened('788')).toHaveLength(2)
    expect(opened('785')).toHaveLength(2)
  })

  it('leaves a quiet feed connected outside service hours', async () => {
    vi.setSystemTime(cph('02:00:00'))
    const { links } = run()
    await settle()
    for (const link of links) link.events.onOpen()
    await vi.advanceTimersByTimeAsync(30 * 60_000)
    expect(links.filter((l) => l.closed)).toHaveLength(0)
  })

  it('logs one line a minute, with its counts', async () => {
    const { links, lines, deliver } = run()
    await settle()
    for (const link of links) link.events.onOpen()
    deliver(sample[0])
    await vi.advanceTimersByTimeAsync(3 * 60_000)
    const minutes = lines.filter((line) => line.message === 'Listener minute')
    expect(minutes).toHaveLength(3)
    expect(minutes[0]).toMatchObject({
      level: 'info',
      datasets: { [sample[0].dataset]: { messages: 1 } },
      requests: { served: 0, refused: 0, unavailable: 0 },
    })
    expect(minutes[1].datasets).toEqual({})
  })
})

describe('the listener’s credentials', () => {
  it('never appear in a line it logs or an answer it gives', async () => {
    const { links, opened, lines, stub, table, deliver, running } = run()
    const answers: string[] = []
    const keep = async (answer: Response) => {
      const bytes = Buffer.from(await answer.arrayBuffer())
      answers.push(
        answer.headers.get('content-encoding') === 'gzip'
          ? gunzipSync(bytes).toString()
          : bytes.toString(),
      )
      answers.push(JSON.stringify(Object.fromEntries(answer.headers)))
    }
    await keep(table())
    await settle()
    for (const link of links) link.events.onOpen()
    for (const message of sample) if (message.receivedAt <= cph('09:06:53')) deliver(message)
    // A link that fails naming everything it was given, and Entra ID refusing the next sign-in.
    stub.entraUp = false
    opened('788')
      .at(-1)!
      .events.onClose(
        `amqps://broker.example/t-distribution-788/${SUBSCRIPTION} ${SECRET} jwt-1 ${TOKEN}`,
      )
    await vi.advanceTimersByTimeAsync(16 * 60_000)
    stub.entraUp = true
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    await keep(table())
    await keep(table('wrong'))
    for (const path of ['/health', '/', '/table?token=x']) {
      await keep(running.listener.handle(new Request(`https://listener.example${path}`)))
    }
    expect(lines.some((line) => line.level === 'warn')).toBe(true)
    expect(lines.some((line) => line.message === 'Listener minute')).toBe(true)
    const written = [...lines.map((line) => JSON.stringify(line)), ...answers]
    for (const text of written) {
      for (const secret of SECRETS) expect(text).not.toContain(secret)
    }
  })
})
