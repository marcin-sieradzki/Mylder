# Effect runs on the server only

Mylder's tracker (the API client, the call budget, the state store, the timetable join) is all timeouts, retries, pacing and time arithmetic, and it may move to an always-on service later. It is written with Effect 4 (`effect` 4.0.6, pinned exactly), as services and layers inside `src/tracker/`, run through one `ManagedRuntime` built at module scope, and exposed to the Next.js route handlers as plain `Promise`-returning functions, so no Effect type crosses the module's boundary. The browser does not use Effect: it fetches one route, keeps a store behind `useSyncExternalStore`, animates outside React and applies the data-state rules from `src/domain/`, which are plain TypeScript because both sides run them. Measured with esbuild, the plain browser store is 0.2 kB gzipped against 25 to 30 kB for Effect plus Schema on the same job, and Effect's React bindings are tagged `unstable`. The snapshot's shape is defined once as an Effect `Schema` on the server; the browser imports its type only.

## Consequences

- Effect appears in `package.json` but in no client module; `server-only` at the tracker's entry makes a wrong import fail the build.
- The one `unstable` Effect module in use, `effect/http`, is confined to one file in the Rejseplanen adapter, so a minor release can break only there.
- The tracker's tests run on `TestClock` through `@effect/vitest`; the browser's tests need no Effect at all.
