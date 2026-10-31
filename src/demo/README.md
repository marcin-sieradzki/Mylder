# Demo

Runs in a Web Worker in the browser, in the GitHub Pages demo only (ADR 0013). The server's tracker on the simulated Rejseplanen, and the aircraft source on the weekday recording's planes in a loop, answering the routes the page asks for.

- `routes.ts`: the demo's routes, which build the tracker from the demo's timetable files and the aircraft source from a recording's aircraft answers, replayed in a loop (`docs/aircraft.md`, "The demo"), each at the first ask, and answer a route's path as `app/api/` does.
- `worker.ts`: the worker's entry, which reads the timetable from beside its script and the weekday recording's aircraft answers from its own bundle, and answers the page's messages; `protocol.ts` is what they say, which `src/map/routes.ts` sends from the page.
- `shims/`: the stand-ins for the Node built-ins the tracker's modules import, which `scripts/demo/worker.config.ts` puts in their place.

`npm run demo` builds the demo into `out/` (`scripts/demo/build.ts`), `npm run demo:serve` serves it as Pages will, at http://localhost:4175/mylder/, and `npm run test:e2e:demo` runs its end-to-end tests against that.
