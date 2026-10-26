// Where the browser's asks for the server's routes go: the page's own server, or, in the GitHub
// Pages demo, the simulated tracker in a Web Worker beside the pages (ADR 0013), which answers
// each route as the server would.
import 'client-only'
import type { RouteAnswer, RouteAsk } from '../demo/protocol.ts'

const TRACKER_WORKER = process.env.NEXT_PUBLIC_MYLDER_TRACKER_WORKER

/** Asks one of the server's routes, such as `/api/snapshot`, as `fetch` would. */
export const fetchRoute = (path: string, init?: RequestInit): Promise<Response> =>
  TRACKER_WORKER ? askWorker(TRACKER_WORKER, path, init?.signal) : fetch(path, init)

interface Waiting {
  answered(answer: RouteAnswer): void
  failed(error: Error): void
}

let worker: { post(path: string): Promise<RouteAnswer> } | undefined

/**
 * The demo's worker, started at the first ask and kept for the page's life. One that fails, as
 * when its script can't load, fails every ask on its way, as a network error would, and is
 * forgotten, so the next ask starts it again.
 */
function trackerWorker(url: string) {
  if (worker) return worker
  const started = new Worker(url, { type: 'module' })
  const waiting = new Map<number, Waiting>()
  let asked = 0
  started.addEventListener('message', (event: MessageEvent<RouteAnswer>) => {
    waiting.get(event.data.id)?.answered(event.data)
    waiting.delete(event.data.id)
  })
  const fail = () => {
    started.terminate()
    if (worker === current) worker = undefined
    for (const each of waiting.values()) each.failed(new Error('The demo tracker stopped'))
    waiting.clear()
  }
  started.addEventListener('error', fail)
  const current = {
    post(path: string) {
      const ask: RouteAsk = { id: ++asked, path }
      return new Promise<RouteAnswer>((answered, failed) => {
        waiting.set(ask.id, { answered, failed })
        started.postMessage(ask)
      })
    },
  }
  worker = current
  return current
}

async function askWorker(url: string, path: string, signal?: AbortSignal | null) {
  signal?.throwIfAborted()
  const aborted = new Promise<never>((_, reject) =>
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true }),
  )
  const { status, headers, body } = await Promise.race([trackerWorker(url).post(path), aborted])
  return new Response(body, { status, headers })
}
