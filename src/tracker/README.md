# Tracker

Runs on the server only. Every module here starts with `import 'server-only'`, so importing one from a client component fails `next build`. Callers go through `index.ts`.

- `rejseplanen/answers.ts`: the Rejseplanen API 2.0 answer schemas every source decodes or encodes with, and their contract fixtures in `rejseplanen/fixtures/`.
- `source.ts`: `MYLDER_SOURCE`, and the `HttpClient` layer each source answers through (`docs/testing-seams.md`).
- `recording/`: the recorded Rejseplanen, an `HttpClient` adapter that replays a folder in `recordings/`, the clock that starts at the recording's moment, and the plans `npm run recordings` freezes the recordings from (`docs/testing-seams.md`).
- `simulation/`: the simulated Rejseplanen (#29), an `HttpClient` adapter that builds answers from the timetable at the runtime's clock, under a scenario.
- `timetable.ts`: the deployed timetable, read once per instance, with service days expanded and pattern paths measured on first use. `testing.ts` holds the fixture timetable the same way for tests.
- `index.ts`: the four plain functions the routes call (`getSnapshot`, `getStopDepartures`, `getTripDetail`, `getDisruptions`); no Effect type leaves the tracker.
- `tracker.ts`: the run (lease, call, build, store); `answers.ts`: the stop and trip answers, pure functions of the timetable and the snapshot, which the on-demand calls fall back to; `runtime.ts` composes its layers once per instance from `MYLDER_SOURCE`, `MYLDER_POSITION_MODE` and `REJSEPLANEN_KEY`.
- `rejseplanen/client.ts`: the Rejseplanen client, one function per service, every attempt counted before it is sent.
- `join.ts` joins a journey to its trip; `build.ts` builds the snapshot's trips with the domain rules from the answer and each trip's history between runs; `snapshot.ts` is the snapshot's schema, whose types the browser imports.
- `health.ts`: the API's health (ok, empty, error, spent) and when it began.
- `disruptions.ts`: the disruption list between fetches, each message as received with its fields' kind, the modes its products concern and its validity as moments; `src/domain/disruption.ts` reads the kind its card names and whether it is active or Later.
- `report.ts`: what each run reports, in its log line and the snapshot's status section, and the CPU clock it measures itself by.
- `budget.ts`: the pacing rule: the month's line, the gap and the level, which sets the poll interval, the disruption fetches and whether on-demand calls are allowed.
- `store.ts`: the store's four operations, in memory until the hosted Redis (#56); `caching.ts`: the CDN header.
