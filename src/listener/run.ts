// The listener's loop (#217, ADR 0019): one link a dataset, signed in with an Entra ID token that
// is renewed every 15 minutes, reconnected with exponential backoff when it closes, and all of
// them reconnected when no dataset has sent a message for 5 minutes in service hours. Each message
// goes to the core (./listener.ts); every minute the core's line is logged and, while it has no
// stops, the app is asked for them again. Every line it logs has its credentials cut out.
import type { SiriEtMessage, SkippedMessage } from '../siri-et/reader.ts'
import { createListener, type Listener } from './listener.ts'
import type { Log, LogLine } from './log.ts'
import { checkStops, STOPS_EVERY, STOPS_RETRY } from './stops.ts'

/** One dataset's subscription: `amqps://<host>/<topic>/<subscription>`, its topic naming it. */
export interface DatasetAddress {
  readonly host: string
  /** `t-distribution-<dataset>`. */
  readonly topic: string
  readonly subscription: string
  /** Dataudveksleren's number for it: `788` Movia, `785` DSB, `801` S-tog, `799` Lokaltog. */
  readonly dataset: string
}

/** What a dataset's link reports. */
export interface LinkEvents {
  /** Signed in, and receiving from its subscription. */
  onOpen(): void
  /** A message, or one skipped unread as too large (./body.ts). */
  onMessage(message: SiriEtMessage | SkippedMessage): void
  /** It closed, for a reason that may name what it was given, so it is never logged unredacted. */
  onClose(reason: string): void
}

/** A dataset's open link. */
export interface Link {
  /** Puts a new token on the connection. */
  renew(token: string): void
  close(): void
}

/** Opens a dataset's link with a token: the AMQP shell (./amqp.ts), or a test's fake. */
export type Connect = (
  address: DatasetAddress,
  clientId: string,
  token: string,
  events: LinkEvents,
) => Link

/** What the listener runs with, all of it from the environment (./config.ts). */
export interface ListenerConfig {
  /** The Dataudveksleren service account: its Entra ID client, tenant and secret. */
  readonly clientId: string
  readonly tenantId: string
  readonly secret: string
  readonly datasets: readonly DatasetAddress[]
  /** The token the table route asks for, `MYLDER_UPDATES_TOKEN`. */
  readonly token: string
  /** The app, whose timetable routes give the box's stops. */
  readonly appUrl: string
  readonly port: number
}

/** A token is renewed this often, well inside the hour an Entra ID token lasts. */
export const TOKEN_EVERY = 15 * 60_000

/** How many of the latest tokens are cut out of log lines: two hours' worth. */
const KEPT_TOKENS = 8

/** A failed renewal is tried again this soon. */
const TOKEN_RETRY = 60_000

/** The first wait before a closed link is opened again, doubling to at most `BACKOFF_MOST`. */
export const BACKOFF_FIRST = 1_000
export const BACKOFF_MOST = 2 * 60_000

/** With no message from any dataset for this long in service hours, every link is reopened. */
export const QUIET_AFTER = 5 * 60_000

/** Service hours, Copenhagen time: from 05:00 to midnight, when every dataset sends. */
const SERVICE_FROM_HOUR = 5
const hourIn = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Copenhagen',
  hour: 'numeric',
  hourCycle: 'h23',
})
export const inServiceHours = (at: number): boolean =>
  Number(hourIn.format(at)) >= SERVICE_FROM_HOUR

/** The minute line, and the quiet feed's check, come this often. */
const MINUTE = 60_000

export interface RunOptions {
  readonly config: ListenerConfig
  readonly connect: Connect
  readonly fetch: typeof globalThis.fetch
  readonly log: Log
  /** The listener's version, which its table names. */
  readonly version: string
}

export interface Running {
  readonly listener: Listener
  /** Closes every link and stops every timer. */
  stop(): void
}

/** Starts the listener: its links, its token's renewal, its minute line and its stops. */
export function startListener({
  config,
  connect,
  fetch,
  log: write,
  version,
}: RunOptions): Running {
  const now = () => Date.now()
  const credentials = [
    config.secret,
    config.clientId,
    config.tenantId,
    config.token,
    ...config.datasets.map((d) => d.subscription),
  ]
  /** The Entra ID tokens of the last two hours, past the hour or so each one lasts. */
  const tokens: string[] = []
  const log = redacting(write, () => [...credentials, ...tokens])
  const listener = createListener({ token: config.token, version, startedAt: now(), now })
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      run()
    }, ms)
    timers.add(timer)
    return timer
  }
  let stopped = false

  // The Entra ID token, kept for `TOKEN_EVERY` and renewed on every link then.
  let jwt: { readonly token: string; readonly at: number } | undefined
  const newToken = async (): Promise<string> => {
    const token = await entraToken(config, fetch)
    tokens.push(token)
    if (tokens.length > KEPT_TOKENS) tokens.shift()
    jwt = { token, at: now() }
    return token
  }
  const renewToken = async () => {
    try {
      const token = await newToken()
      for (const { link } of links.values()) link?.renew(token)
      later(TOKEN_EVERY, renewToken)
    } catch (error) {
      log({ level: 'warn', message: `The listener couldn’t renew its token: ${messageOf(error)}` })
      later(TOKEN_RETRY, renewToken)
    }
  }

  // Each dataset's link, its backoff, and when the last message came from any of them.
  const links = new Map<
    string,
    { link?: Link; attempts: number; retry?: ReturnType<typeof setTimeout> }
  >(config.datasets.map((d) => [d.dataset, { attempts: 0 }]))
  let quietSince = now()

  const open = (address: DatasetAddress) => {
    const state = links.get(address.dataset)!
    state.retry = undefined
    const fresh = jwt && now() - jwt.at < TOKEN_EVERY ? jwt.token : undefined
    if (fresh) return openWith(address, fresh)
    newToken().then(
      (token) => openWith(address, token),
      (error) => closed(address, `no token: ${messageOf(error)}`),
    )
  }

  const openWith = (address: DatasetAddress, token: string) => {
    if (stopped) return
    const state = links.get(address.dataset)!
    let current = true
    const link = connect(address, config.clientId, token, {
      onOpen: () => {
        if (!current) return
        state.attempts = 0
        log({ level: 'info', message: `Dataset ${address.dataset} is listening` })
      },
      onMessage: (message) => {
        if (!current) return
        quietSince = now()
        listener.receive(message)
      },
      onClose: (reason) => {
        if (!current) return
        current = false
        state.link = undefined
        closed(address, reason)
      },
    })
    state.link = {
      renew: link.renew,
      close: () => {
        current = false
        link.close()
      },
    }
  }

  const closed = (address: DatasetAddress, reason: string) => {
    if (stopped) return
    const state = links.get(address.dataset)!
    const wait = Math.min(BACKOFF_FIRST * 2 ** state.attempts, BACKOFF_MOST)
    state.attempts++
    log({
      level: 'warn',
      message: `Dataset ${address.dataset}’s link closed (${reason}); reopening in ${wait / 1000} s`,
    })
    state.retry = later(wait, () => open(address))
  }

  const reopenAll = () => {
    for (const address of config.datasets) {
      const state = links.get(address.dataset)!
      state.link?.close()
      state.link = undefined
      if (state.retry) clearTimeout(state.retry)
      state.attempts = 0
      open(address)
    }
    quietSince = now()
  }

  const minute = () => {
    log({ level: 'info', message: 'Listener minute', ...listener.minute() })
    const at = now()
    if (inServiceHours(at) && at - quietSince >= QUIET_AFTER) {
      log({
        level: 'warn',
        message: `No message from any dataset for ${QUIET_AFTER / 60_000} minutes; reopening every link`,
      })
      reopenAll()
    }
  }
  const minutes = setInterval(minute, MINUTE)

  const stops = async () => {
    await checkStops({ appUrl: config.appUrl, fetch, listener, log })
    if (!stopped) later(listener.box() ? STOPS_EVERY : STOPS_RETRY, stops)
  }

  log({
    level: 'info',
    message: `The listener ${version} starts on datasets ${config.datasets.map((d) => d.dataset).join(', ')}`,
  })
  void stops()
  newToken().then(
    () => {
      later(TOKEN_EVERY, renewToken)
      for (const address of config.datasets) open(address)
    },
    (error) => {
      log({
        level: 'warn',
        message: `The listener couldn’t get its first token: ${messageOf(error)}`,
      })
      later(TOKEN_RETRY, renewToken)
      for (const address of config.datasets) closed(address, 'no token yet')
    },
  )

  return {
    listener,
    stop: () => {
      stopped = true
      clearInterval(minutes)
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      for (const state of links.values()) state.link?.close()
    },
  }
}

/** An Entra ID client-credentials token for Service Bus. Its error names Entra's code only. */
export async function entraToken(
  { clientId, tenantId, secret }: Pick<ListenerConfig, 'clientId' | 'tenantId' | 'secret'>,
  fetch: typeof globalThis.fetch,
): Promise<string> {
  const answer = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: secret,
        scope: 'https://servicebus.azure.net/.default',
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    },
  )
  const body = (await answer.json().catch(() => ({}))) as {
    access_token?: unknown
    error?: unknown
  }
  if (!answer.ok || typeof body.access_token !== 'string') {
    throw new Error(
      `Entra ID answered ${answer.status}${typeof body.error === 'string' ? ` ${body.error}` : ''}`,
    )
  }
  return body.access_token
}

/**
 * A log that cuts each of `secrets`, as they stand when a line is written, out of every string in
 * the line, in one pass, so no secret is found inside another's mark.
 */
function redacting(log: Log, secrets: () => readonly string[]): Log {
  const redact = (value: unknown, pattern: RegExp): unknown => {
    if (typeof value === 'string') return value.replace(pattern, '<redacted>')
    if (Array.isArray(value)) return value.map((each) => redact(each, pattern))
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, each]) => [key, redact(each, pattern)]),
      )
    }
    return value
  }
  return (line) => {
    const cut = secrets()
      .filter(Boolean)
      .toSorted((a, b) => b.length - a.length)
      .map((secret) => secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    log(cut.length > 0 ? (redact(line, new RegExp(cut.join('|'), 'g')) as LogLine) : line)
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
