// The GitHub Pages demo's tracker (ADR 0013), in a Web Worker: the demo's routes, reading the
// timetable from the folder the demo serves beside this script, answering the page's asks.
import './shims/process.ts'
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
    // The timetable couldn't be read: a 503, as the server's routes answer then.
    console.error('The demo tracker could not answer', error)
    response = new Response(null, { status: 503 })
  }
  const answer: RouteAnswer = {
    id,
    status: response.status,
    headers: [...response.headers],
    body: await response.text(),
  }
  self.postMessage(answer)
})
