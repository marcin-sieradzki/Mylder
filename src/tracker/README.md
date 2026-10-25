# Tracker

Runs on the server only. Every module here starts with `import 'server-only'`, so importing one from a client component fails `next build`. Callers go through `index.ts`.

- `rejseplanen/answers.ts`: the Rejseplanen API 2.0 answer schemas every source decodes or encodes with, and their contract fixtures in `rejseplanen/fixtures/`.
- `source.ts`: `MYLDER_SOURCE`, and the `HttpClient` layer each source answers through (`docs/testing-seams.md`).
- `simulation/`: the simulated Rejseplanen (#29), an `HttpClient` adapter that builds answers from the timetable at the runtime's clock, under a scenario.
- `timetable.ts`: the deployed timetable, read once per instance, with service days expanded and pattern paths measured on first use. `testing.ts` holds the fixture timetable the same way for tests.
