// The GitHub Pages demo's tracker (ADR 0013), in a Web Worker: the demo's routes, reading the
// timetable from the folder the demo serves beside this script, answering the page's asks.
import './shims/process.ts'
import { unavailable } from '../tracker/cdn-answer.ts'
import type { RouteAnswer, RouteAsk } from './protocol.ts'
import { demoRoutes } from './routes.ts'

const route = demoRoutes({
  async read(file) {
    const response = await fetch(new URL(`timetable/${file}`, self.location.href))
    if (!response.ok) throw new Error(`${response.status} for the timetable's ${file}`)
    return response.text()
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
