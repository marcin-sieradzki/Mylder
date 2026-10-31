/// <reference types="vite/types/importMeta.d.ts" />
// The GitHub Pages demo's tracker (ADR 0013), in a Web Worker: the demo's routes, reading the
// timetable from the folder the demo serves beside this script, and the planes from the weekday
// recording's aircraft answers, bundled into this script, answering the page's asks.
import './shims/process.ts'
import { unavailable } from '../tracker/cdn-answer.ts'
import { bundledFiles } from '../tracker/recording/layer.ts'
import type { RouteAnswer, RouteAsk } from './protocol.ts'
import { demoRoutes } from './routes.ts'

const route = demoRoutes({
  async read(file) {
    const response = await fetch(new URL(`timetable/${file}`, self.location.href))
    if (!response.ok) throw new Error(`${response.status} for the timetable's ${file}`)
    return response.text()
  },
  // Whatever the folder holds when the demo is built: a few minutes of answers, small enough
  // compressed to ride in this script rather than be fetched beside it.
  aircraft: {
    dir: '../../recordings/weekday',
    files: bundledFiles(
      import.meta.glob('../../recordings/weekday/aircraft/*.json', {
        eager: true,
        import: 'default',
      }),
    ),
  },
})

self.addEventListener('message', async (event: MessageEvent<RouteAsk>) => {
  const { id, path } = event.data
  let response: Response
  try {
    response = await route(path)
  } catch (error) {
    // Every route answers its own failures; this is for one that slipped through.
    response = unavailable(error, `route ${path}`)
  }
  const answer: RouteAnswer = {
    id,
    status: response.status,
    headers: [...response.headers],
    body: await response.text(),
  }
  self.postMessage(answer)
})
