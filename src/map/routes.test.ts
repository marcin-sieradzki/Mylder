import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RouteAnswer, RouteAsk } from '../demo/protocol'

// The demo's path for the routes (ADR 0013): with a worker named, every ask goes to it. jsdom has
// no workers, so a stand-in answers as the demo's would, or fails to load.

let workers: FakeWorker[] = []

class FakeWorker extends EventTarget {
  terminated = false
  readonly url: string
  constructor(url: string) {
    super()
    this.url = url
    workers.push(this)
  }
  postMessage(ask: RouteAsk) {
    const answer: RouteAnswer = {
      id: ask.id,
      status: ask.path === '/api/snapshot' ? 200 : 404,
      headers: [['Content-Type', 'application/json']],
      body: JSON.stringify({ path: ask.path }),
    }
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: answer })))
  }
  terminate() {
    this.terminated = true
  }
}

async function demoFetch() {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_MYLDER_TRACKER_WORKER', '/mylder/tracker-worker.js')
  vi.stubGlobal('Worker', FakeWorker)
  return (await import('./routes')).fetchRoute
}

afterEach(() => {
  workers = []
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('in the demo, an ask for a route', () => {
  it("is answered by the tracker's worker, one worker for every ask", async () => {
    const fetchRoute = await demoFetch()
    const snapshot = await fetchRoute('/api/snapshot')
    expect(snapshot.status).toBe(200)
    expect(await snapshot.json()).toEqual({ path: '/api/snapshot' })
    expect((await fetchRoute('/api/stops/nowhere')).status).toBe(404)
    expect(workers.map((worker) => worker.url)).toEqual(['/mylder/tracker-worker.js'])
  })

  it('fails as a network error would when the worker fails, and the next starts it again', async () => {
    const fetchRoute = await demoFetch()
    vi.spyOn(FakeWorker.prototype, 'postMessage').mockImplementationOnce(function (
      this: FakeWorker,
    ) {
      queueMicrotask(() => this.dispatchEvent(new Event('error')))
    })
    await expect(fetchRoute('/api/snapshot')).rejects.toThrow('The demo tracker stopped')
    expect(workers[0].terminated).toBe(true)
    expect((await fetchRoute('/api/snapshot')).status).toBe(200)
    expect(workers).toHaveLength(2)
  })

  it('rejects at once when its signal aborts', async () => {
    const fetchRoute = await demoFetch()
    const controller = new AbortController()
    const asked = fetchRoute('/api/snapshot', { signal: controller.signal })
    controller.abort()
    await expect(asked).rejects.toThrow('aborted')
  })
})
