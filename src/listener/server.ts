// The listener's one inbound port (#217): Node's HTTP server in front of the core's handler, which
// takes only GETs and only the authorization header from them. TLS ends at the platform's edge.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export type Handle = (request: Request) => Response

/** Starts the server on `port` (0 for any free one), answering each request with `handle`. */
export function serve(handle: Handle, port: number, host?: string): Promise<Server> {
  const server = createServer((incoming, outgoing) => {
    answer(handle, incoming, outgoing).catch(() => {
      if (!outgoing.headersSent) outgoing.writeHead(500)
      outgoing.end()
    })
  })
  // A slow client holds no socket for long.
  server.requestTimeout = 10_000
  server.headersTimeout = 5_000
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve(server))
  })
}

/** The port a started server listens on. */
export const portOf = (server: Server): number => (server.address() as AddressInfo).port

async function answer(handle: Handle, incoming: IncomingMessage, outgoing: ServerResponse) {
  const { authorization } = incoming.headers
  // Anything but a GET is no route's: answered here, so no other method reaches a `Request`.
  const response =
    incoming.method === 'GET'
      ? handle(
          new Request(new URL(incoming.url ?? '/', 'http://listener'), {
            headers: authorization === undefined ? {} : { authorization },
          }),
        )
      : new Response(null, { status: 404 })
  const body = Buffer.from(await response.arrayBuffer())
  outgoing.writeHead(response.status, {
    ...Object.fromEntries(response.headers),
    'content-length': String(body.byteLength),
  })
  outgoing.end(body)
}
