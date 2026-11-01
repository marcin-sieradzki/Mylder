// The AMQP shell (#217, ADR 0019): one connection to Dataudveksleren's Azure Service Bus a
// dataset, over AMQP 1.0 with TLS, signed in with an Entra ID token put on it with a CBS
// `put-token`, as the probe in scripts/siri-et/record-siri-et.mjs did. It holds no logic: each
// message body goes to the loop (./run.ts), which hands it to the reader. No test reaches it; the
// loop's tests run on a fake `Connect`, and the listener's minute line proves it in production.
import { createRequire } from 'node:module'
import { gunzipSync } from 'node:zlib'
import type { EventContext, Message } from 'rhea'
import type { SiriEtMessage } from '../siri-et/reader.ts'
import type { Connect, DatasetAddress } from './run.ts'

// rhea exports one container as its CommonJS module, which ESM sees only as a default its types
// don't declare.
const rhea = createRequire(import.meta.url)('rhea') as typeof import('rhea')

/** AMQP over TLS. */
const PORT = 5671

/**
 * Messages the broker may send ahead of the reader: bounded, so a backlog of Movia's messages, up
 * to about 1 MB each, holds at most about 20 MB in flight on a 256 MB machine.
 */
export const PREFETCH = 20

/** Opens one dataset's subscription with `token`, reporting to `events`. */
export const connectAmqp: Connect = (address, clientId, token, events) => {
  const { host, topic, subscription, dataset } = address
  let closed = false
  let listening = false
  const close = (reason: string) => {
    if (closed) return
    closed = true
    connection.close()
    events.onClose(reason)
  }
  const connection = rhea.create_container().connect({
    host,
    hostname: host,
    port: PORT,
    transport: 'tls',
    reconnect: false,
    // SASL ANONYMOUS, naming the client: the token on the CBS link is what signs in.
    username: clientId,
  })
  const cbs = connection.open_sender('$cbs')
  const cbsReplies = connection.open_receiver('$cbs')
  let sent = 0
  const putToken = (jwt: string) =>
    cbs.send({
      reply_to: 'cbs',
      message_id: ++sent,
      application_properties: {
        operation: 'put-token',
        type: 'jwt',
        name: `amqps://${host}/${topic}`,
      },
      body: jwt,
    })
  cbs.on('sender_open', () => putToken(token))
  cbsReplies.on('message', ({ message }: EventContext) => {
    const code = Number(message?.application_properties?.['status-code'])
    if (!(code >= 200 && code < 300)) return close(`its token was refused (${code})`)
    if (listening) return
    listening = true
    const receiver = connection.open_receiver({
      source: `${topic}/subscriptions/${subscription}`,
      credit_window: PREFETCH,
      // Settled on receipt: at most once, since a trip's next update replaces its last.
      autoaccept: true,
    })
    receiver.on('message', ({ message: delivered }: EventContext) => {
      if (delivered) events.onMessage(siriEtMessage(dataset, delivered))
    })
    receiver.on('receiver_close', () => close('its subscription link closed'))
    receiver.on('receiver_error', () => close('its subscription link failed'))
    events.onOpen()
  })
  connection.on('disconnected', () => close('it was disconnected'))
  connection.on('connection_close', () => close('the broker closed it'))
  connection.on('connection_error', () => close('the connection failed'))
  // An error event no one handles would reach the container, which throws it.
  connection.on('error', () => close('the connection failed'))
  return {
    renew: (jwt) => {
      if (!closed && cbs.sendable()) putToken(jwt)
    },
    close: () => {
      closed = true
      connection.close()
    },
  }
}

/** The broker's message as the reader takes it: its body as text, and when it was queued. */
function siriEtMessage(dataset: string, message: Message): SiriEtMessage {
  const queued = message.message_annotations?.['x-opt-enqueued-time'] as unknown
  const receivedAt =
    queued instanceof Date ? queued.getTime() : typeof queued === 'number' ? queued : Date.now()
  return { dataset, receivedAt, body: bodyText(message.body) }
}

/** A body as text, from whichever AMQP section it came in, unzipped when it is gzip. */
function bodyText(body: unknown): string {
  const bytes = bufferOf(body)
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
  return (gzipped ? gunzipSync(bytes) : bytes).toString('utf8')
}

function bufferOf(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) return body
  if (typeof body === 'string') return Buffer.from(body)
  const content = (body as { content?: unknown } | null)?.content
  if (Buffer.isBuffer(content)) return content
  if (Array.isArray(body)) return Buffer.concat(body.map(bufferOf))
  return Buffer.from(String(body ?? ''))
}

/** An address in `DU_ADDRESSES`: `amqps://<host>/t-distribution-<dataset>/<subscription>`. */
export function readAddress(address: string): DatasetAddress | undefined {
  const match = /^amqps:\/\/([^/]+)\/(t-distribution-(\d+))\/([^/]+)$/.exec(address.trim())
  if (!match) return undefined
  const [, host, topic, dataset, subscription] = match
  return { host, topic, subscription, dataset }
}
