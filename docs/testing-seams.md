# Testing seams

Where Mylder's tests cut in, what each cut replays or fakes, and what a good test looks like. Fewer seams, placed higher, mean more of the real code runs in every test. There are two seams, both Effect layers inside `src/tracker/`, and one switch that sets both.

Until the Rejseplanen key arrives, a third adapter at the API seam answers in its place: the simulated Rejseplanen (spec #29), which builds every answer from the prepared timetable at the runtime's clock.

## The seams

### 1. The API: a recorded `HttpClient` layer

The tracker reaches Rejseplanen through Effect's `HttpClient` service. Live, that is `FetchHttpClient.layer`. In tests it is `RecordedHttpClient.layer(RECORDED_REJSEPLANEN, dir)`, built with `HttpClient.make` through the tracker's one door to Effect's HTTP module, `src/tracker/http.ts`: for each request it reads the service name from the URL path (`journeyPos`, `multiDepartureBoard`, `journeyDetail`, `himsearch`), takes the next file for that service in call order from the recording folder (`journeyPos/0001.json`, `0002.json`, ...), and returns it with `HttpClientResponse.fromWeb`. A file may also describe a failure instead of a 200's body (`{ "status": 503 }`, `{ "status": 401, "body": { "errorCode": "API_AUTH", ... } }`, or `{ "timeout": true }`, which hangs past any client timeout and then answers 504), and a service with no files left repeats its last answer. A call to a service the recording has no files for answers Rejseplanen's `SVC_PARAM` error. The layer replays any API the same way: it takes the API's description (its folders, the folder a URL calls, its answer to a call with no folder), and Rejseplanen's, `RECORDED_REJSEPLANEN`, lives in its adapter beside its schemas, in `src/tracker/rejseplanen/responses.ts`, and the freezer files each call it tapes by the same rule. An API whose rule names a folder it doesn't list, or a folder that is there but can't be read, fails the replay instead of answering as if it had no calls. Nothing above the HTTP layer is faked: the schemas, the retries, the timeout, the budget, the store, the timetable join and the data-state rules all run as in production. Every source's answers decode with the schemas in `src/tracker/rejseplanen/answers.ts`, whose hand-written contract fixtures sit beside them.

A recording is one folder in `recordings/`: the API answers, a `timetable/` folder with prepared files for the same service day and box, `clock.json` with the moment the recording started (`{ "start": "2026-06-16T05:20:00.000Z" }`), `snapshots/` with the tracker's snapshot of each minute, which screen tests use, and `answers/` with the route answers they use beside it: the disruption list of each minute in `answers/disruptions/` and the stop and trip answers a plan saves. Recordings are saved from real answers once the key arrives (Record an hour of journeyPos at morning rush (#12)), with the key stripped from any URL. Until then every recording is frozen from the simulation: `npm run recordings` (or `npm run recordings -- <name>`) runs the tracker over each plan in `src/tracker/recording/plans.ts`, a scenario on the fixture timetable for a number of minutes on `TestClock`, and rewrites its folder with what the simulation answered and the snapshots and disruption lists the tracker gave. The cases a real hour may not show are frozen the same way: `empty` (an empty `journeyPos`), `refused-key`, `spent` (Rejseplanen's quota error; the tracker's own monthly counter running out is a tracker test's to show) and `cap` (a 1,000-journey answer, filled with copies under journey numbers no trip has), beside a ten-minute `weekday`. A test replays each recording through the tracker and expects the snapshots and lists it was frozen with, so a change to the tracker's output fails until the recordings are frozen again.

### 2. Time: Effect's `Clock`

Every time check in the tracker reads `Clock.currentTimeMillis`, never `Date.now()`. In Vitest, `@effect/vitest`'s `it.effect` provides `TestClock`, so `TestClock.adjust('5 minutes')` moves the tracker's clock without waiting. Under a recording in a production build, the runtime provides a clock that starts at `clock.json`'s moment and advances in real time, so the recorded day is "today" for the timetable and the snapshot's ages are the recorded ones. The browser's clock in Playwright is set with `page.clock.install({ time })` to the same moment.

A run's CPU time comes the same way, from the tracker's `CpuClock` (`src/tracker/report.ts`), never from `process.cpuUsage()` directly: the server provides the process's own, frozen recordings `stoppedCpu` so their snapshots come out the same every time, and a test whatever clock its figure needs.

### The switch: `MYLDER_SOURCE`

One environment variable picks where the tracker's answers come from (`src/tracker/source.ts`), and the tracker builds its runtime from it. It is read at request time, so one `next build` serves CI's Playwright run, previews and production.

| Value                                 | API layer                                                                                        | Clock                                                 | Timetable                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ---------------------------- |
| `simulated` or `simulated:<scenario>` | The simulated Rejseplanen, under the named scenario (`weekday` when none is named). The default. | The runtime's: real time, `TestClock` in tests        | The deployed one             |
| `recording:<folder>`                  | The recorded layer above, replaying the folder                                                   | Starts at `clock.json`'s moment, runs on in real time | The recording's `timetable/` |
| `rejseplanen`                         | `FetchHttpClient.layer`, with the key from its own variable                                      | The runtime's                                         | The deployed one             |

The key never picks the source. `rejseplanen` without a key logs the fault and the snapshot's API health reads as a refused key, so a missing key fails visibly instead of quietly showing a simulation. Going live is the key and `MYLDER_SOURCE=rejseplanen` in Production. While the source is not `rejseplanen`, the snapshot names it and every screen says so in a banner.

The store needs no switch: `SnapshotStore` is in memory whenever no Redis URL is set, which is also how local development runs. Its keys carry the source, so a simulated call counter never shares a key with the real one.

There is no third seam: the simulation is an adapter at the API seam, not a seam of its own. Screens are tested with real snapshots (saved from the tracker's output over a recording), the map's loop with real patterns, and nothing in the browser is mocked.

## What each kind of test looks like

Every test asserts external behaviour: what the route returns, what the snapshot says, what a person sees. None asserts that a function was called.

- **Domain** (`src/domain/*.test.ts`): plain Vitest, tables of inputs and expected states. "A trip reported 70 s ago on a 60 s interval is Ageing." "A computed position is never Live." These are the same functions the browser runs, so a table proven here holds on both sides.
- **Tracker** (`src/tracker/*.test.ts`, `it.effect`): provide `RecordedHttpClient.layer(RECORDED_REJSEPLANEN, recordingDir('weekday'))` and the in-memory store, then play requests against `Tracker.getSnapshot` with `TestClock.adjust` between them, and assert on the snapshot. A good one: "Two requests 10 s apart make one API call." "A trip in the first answer and absent from the next six, over 6 min, is No signal; one absent for 3 min is Ageing." "When the month's counter runs ahead of the day, `nextDue` stretches to 90 s and `getStopDepartures` answers from the timetable with the snapshot's delay." "Three 503s in a row give `api.health: 'error'` and a 200 with the previous snapshot's trips, still moving on their timelines." "An answer the schema rejects is logged without the key and counts as `error`."
- **Screens** (`src/screens/*.test.tsx`, jsdom, Testing Library): render with a saved snapshot and assert text and roles in English and Danish. "A No signal vehicle's detail says 'No signal since 10:42'." "Metro departures read 'every 3 min'."
- **End to end** (`e2e/*.spec.ts`, Playwright on the production build with `MYLDER_SOURCE=recording:weekday`, every page's clock installed at the recording's moment by `e2e/recording.ts`, and a second server on the same build on the simulation, to prove the default source starts): a few journeys that prove the wiring, not the time rules. The map shows as many vehicles as the recording's snapshot; open one and follow it; a stop's departures; the Disruptions screen; `/da`; the page's notice when its own polls fail (block the route with `page.route`). The 5-minute rules are proven in the tracker tests, where the clock is free.

## Rules

- Recordings carry no key, no personal data and no more than a scenario needs; prefer a hand-made 20-journey recording to a full-city hour where the case allows.
- A test never reads `Date.now()` on the server side and never sleeps.
- A change to the snapshot schema regenerates the saved snapshots the screen tests use, from the recordings, with one script.
- CI needs no secrets, because no test calls the API.
