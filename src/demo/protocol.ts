// What the page and the demo's tracker worker (ADR 0013) say to each other: the page asks for one
// of the server's routes by its path, and the worker answers as the route would, as plain data a
// message can carry.

/** An ask for one route, such as `/api/snapshot`, numbered so its answer finds it. */
export interface RouteAsk {
  readonly id: number
  readonly path: string
}

/** The route's answer to the ask with the same number. */
export interface RouteAnswer {
  readonly id: number
  readonly status: number
  readonly headers: [string, string][]
  readonly body: string
}
