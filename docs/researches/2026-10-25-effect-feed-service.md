# Effect for a streaming feed service and a React client

Research for Mylder issue #7, 2026-10-25. Effect version checked: 4.0.6.

## Short answers

- **Service.** Effect 4 covers the whole feed service in one package. Poll with `Effect.repeat(Schedule.spaced("1 minute"))`, retry with a jittered `Schedule.exponential`. Hold vehicles in a `SubscriptionRef<HashMap>` and fan changes out through a `PubSub.sliding`. Parse SIRI-ET with the new streaming `Xml` module in `effect/encoding`, then check each journey with `Schema`. Serve SSE with `HttpApiSchema.StreamSse` on `@effect/platform-node`. Layers, scopes and `Layer.launch` handle resource safety and shutdown. `Logger.consoleJson`, `Effect.withSpan`, `Metric` and the OTLP or Prometheus exporters cover logs, traces and metrics. I built and ran this sketch end to end against a synthetic SIRI-ET file.
- **Testing.** `@effect/vitest` 4.0.6 works with the repo's Vitest 5. `it.effect` runs on `TestClock`, so a 60 s poll loop or a 5 min "lost" threshold runs in milliseconds. To replay a recorded feed, provide a fake source layer that streams the saved XML in chunks. Both tests passed here.
- **Client and Next.js.** The Effect team's atom library is now official as `effect/reactivity` plus `@effect/atom-react` (React 19 only). It is shipped but tagged `unstable`. It can turn an SSE `Stream` into an atom and hydrate server state with `HydrationBoundary`. There is no official Next.js adapter. Route handlers can use `HttpRouter.toWebHandler`, and server actions can use a module-level `ManagedRuntime`. The client cost is about 7 kB gzipped for a bare Effect program and about 42 kB gzipped for Effect plus Schema plus Atom (rolldown, React excluded). With esbuild and `import { … } from "effect"` it was 126 kB, so the bundler matters.
- **Versions.** Effect 4 is the current stable major. `effect@4.0.0` shipped on 2026-10-01, `4.0.6` on 2026-10-22, and npm's `latest` tag is `4.0.6`. 4.x is an LTS release with at least three years of fixes. Effect 3 is still patched on the `prev` tag (`3.22.4`, 2026-10-22) but has a feature freeze. "Beta" is gone. The risk now sits in per-API stability tags: the core (`Effect`, `Stream`, `Schema`, `Schedule`, `PubSub`, `SubscriptionRef`, `TestClock`) is `stable`. HTTP, HttpApi, SSE, reactivity, observability and `@effect/atom-react` are `unstable` and can break in minor releases. `Xml` and `Zip` are `experimental`, can break in patch releases, and are only three days old.

## Versions and migration risk

The npm registry on 2026-10-25 (`npm view effect dist-tags`):

| Tag      | Version          | Published  |
| -------- | ---------------- | ---------- |
| `latest` | `4.0.6`          | 2026-10-22 |
| `prev`   | `3.22.4`         | 2026-10-22 |
| `rc`     | `4.0.0-rc.118`   | 2026-09-28 |
| `beta`   | `4.0.0-beta.107` | 2026-08-10 |

`4.0.0` was published on 2026-10-01. The beta started on 2026-02-18.

What changed in 4.0, from the changelog and migration guide:

- All Effect packages share one version and ship together. Use the same exact version of `effect` and every `@effect/*` package.
- `@effect/platform`, `@effect/rpc`, `@effect/experimental` and similar packages merged into `effect`. Import from `effect/http`, `effect/http-api`, `effect/encoding`, `effect/reactivity`, `effect/observability` and so on. The old `@effect/platform` on npm is still at `0.97.x` and is the v3-era package. Do not install it.
- During the RCs these modules lived under `effect/unstable/*`. That segment was dropped before 4.0, with no compatibility paths. Search results and older guides still show `effect/unstable/...`, so expect stale examples.
- Every module and export carries a `@stability` tag. `stable` (or no tag) follows strict semver. `unstable` can break in minor releases. `experimental` can break in patch releases. All modules in packages other than `effect` are `unstable` for now.
- 4.x is LTS: at least three years of bug and security fixes. Bug fixes continue one year after 5.0, security fixes two years after.
- Effect 3 lives on the `v3` branch. It gets bug and security fixes only. I found no published end date for v3.

What that means for Mylder:

- **Start on 4.x.** Starting on 3.x now means a large migration later: services move from `Context.Tag` to `Context.Service`, Schema is a new implementation, and the package layout changed. There is no code to migrate yet.
- **Pin exact versions** (`"effect": "4.0.6"`, no caret) and update all Effect packages together in one PR. A caret allows minor releases, and minor releases can break the `unstable` APIs we use.
- **Keep unstable APIs behind our own services.** The sketch below touches `unstable` or `experimental` APIs only inside `SiriSource` (Xml, HttpClient) and the HTTP layer (HttpApi, SSE). The vehicle store and the state rules use only stable modules. A breaking change then touches one file.
- **Treat `Xml` as the riskiest piece.** It was added in 4.0.6 and is `experimental`. Its events and options can change in a patch release. A plain SAX parser (`saxes`) is the fallback, and the benchmark below shows similar speed.

## The feed service

### Layers

Four layers, each a `Context.Service` with a `layer`:

1. **`SiriSource`**: one poll of SIRI-ET as a `Stream` of decoded journeys. It reads the URL from `Config` and uses `HttpClient`. The response body streams through `Xml.decode()` and `Xml.elements([...path])`, which yields one `EstimatedVehicleJourney` tree at a time. `Schema` then checks each one. A large response never sits in memory as one string or one DOM.
2. **`Timetable`** (not in the sketch): NeTEx or GTFS, loaded at start and refreshed daily. It gives the route shapes and planned times that position estimates need. This is batch work, not live streaming.
3. **`Vehicles`**: the state. A `SubscriptionRef<HashMap<journeyRef, VehicleState>>` holds the current snapshot. A `PubSub.sliding` carries each change. Two scoped fibers run inside the layer. One polls once a minute (the free tier budget). One ticks every second to age data states (estimated, then ageing after 60 s, then lost after 5 min) from the `Clock`.
4. **HTTP**: an `HttpApi` with one SSE endpoint. Each connection subscribes to the PubSub, reads the snapshot, then streams the snapshot followed by the changes. `HttpRouter.serve` on `NodeHttpServer.layer`, started with `Layer.launch(...).pipe(NodeRuntime.runMain)`.

### Sketch

This typechecks against `effect@4.0.6` and `@effect/platform-node@4.0.6`. I ran it against a local file server, and `curl /vehicles` returned one `data:` event per journey.

```ts
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import {
  Clock,
  Config,
  Context,
  Effect,
  HashMap,
  Layer,
  PubSub,
  Schedule,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect'
import { Xml } from 'effect/encoding'
import { FetchHttpClient, HttpClient, HttpRouter } from 'effect/http'
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from 'effect/http-api'
import { createServer } from 'node:http'

const JourneyUpdate = Schema.Struct({
  journeyRef: Schema.String,
  lineRef: Schema.String,
  recordedAt: Schema.String,
  cancelled: Schema.Boolean,
})
type JourneyUpdate = typeof JourneyUpdate.Type

const VehicleState = Schema.Struct({
  journeyRef: Schema.String,
  lineRef: Schema.String,
  lastHeardMs: Schema.Number,
  state: Schema.Literals(['estimated', 'ageing', 'lost', 'cancelled']),
})
type VehicleState = typeof VehicleState.Type

// Xml.Element -> plain record of child text; Schema does the checking.
const childText = (el: Xml.Element, name: string) => {
  for (const c of el.children)
    if (typeof c !== 'string' && c.name === name)
      return c.children.filter((x) => typeof x === 'string').join('')
}
const decodeJourney = Schema.decodeUnknownEffect(JourneyUpdate)
const toJourney = (el: Xml.Element) =>
  decodeJourney({
    journeyRef: childText(el, 'DatedVehicleJourneyRef'),
    lineRef: childText(el, 'LineRef'),
    recordedAt: childText(el, 'RecordedAtTime'),
    cancelled: childText(el, 'Cancellation') === 'true',
  })

const ET_PATH = [
  'Siri',
  'ServiceDelivery',
  'EstimatedTimetableDelivery',
  'EstimatedJourneyVersionFrame',
  'EstimatedVehicleJourney',
]

class SiriSource extends Context.Service<
  SiriSource,
  {
    readonly poll: Stream.Stream<JourneyUpdate, unknown>
  }
>()('mylder/SiriSource') {
  static readonly layer = Layer.effect(
    SiriSource,
    Effect.gen(function* () {
      const url = yield* Config.String('SIRI_ET_URL')
      const http = yield* HttpClient.HttpClient
      const poll = http.get(url).pipe(
        Effect.map((res) => res.stream),
        Stream.unwrap,
        Stream.pipeThroughChannel(Xml.decode()),
        Stream.pipeThroughChannel(Xml.elements(ET_PATH)),
        Stream.mapEffect(toJourney),
      )
      return SiriSource.of({ poll })
    }),
  )
}

class Vehicles extends Context.Service<
  Vehicles,
  {
    // Snapshot first, then live changes.
    readonly live: Stream.Stream<VehicleState>
  }
>()('mylder/Vehicles') {
  static readonly layer = Layer.effect(
    Vehicles,
    Effect.gen(function* () {
      const source = yield* SiriSource
      const ref = yield* SubscriptionRef.make(HashMap.empty<string, VehicleState>())
      const hub = yield* PubSub.sliding<VehicleState>({ capacity: 4096 })
      const put = (v: VehicleState) =>
        SubscriptionRef.update(ref, HashMap.set(v.journeyRef, v)).pipe(
          Effect.andThen(PubSub.publish(hub, v)),
        )

      const apply = (u: JourneyUpdate) =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((now) =>
            put({
              journeyRef: u.journeyRef,
              lineRef: u.lineRef,
              lastHeardMs: now,
              state: u.cancelled ? 'cancelled' : 'estimated',
            }),
          ),
        )

      // Poll once a minute. Retry a failed poll with jittered backoff. One bad poll never ends the loop.
      yield* source.poll.pipe(
        Stream.runForEach(apply),
        Effect.retry(
          Schedule.exponential('1 second').pipe(Schedule.jittered, Schedule.upTo({ times: 5 })),
        ),
        Effect.catchCause((cause) => Effect.logWarning('poll failed', cause)),
        Effect.withSpan('siri.poll'),
        Effect.repeat(Schedule.spaced('1 minute')),
        Effect.forkScoped, // interrupted when the layer's scope closes
      )

      // Age data states from the clock every second.
      const age = (v: VehicleState, now: number): VehicleState['state'] =>
        v.state === 'cancelled'
          ? 'cancelled'
          : now - v.lastHeardMs > 300_000
            ? 'lost'
            : now - v.lastHeardMs > 60_000
              ? 'ageing'
              : v.state
      yield* Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        for (const v of HashMap.values(yield* SubscriptionRef.get(ref))) {
          const state = age(v, now)
          if (state !== v.state) yield* put({ ...v, state })
        }
      }).pipe(Effect.repeat(Schedule.spaced('1 second')), Effect.forkScoped)

      // Subscribe before reading the snapshot, so no change falls in the gap.
      const live = Stream.unwrap(
        Effect.gen(function* () {
          const sub = yield* PubSub.subscribe(hub)
          const snap = yield* SubscriptionRef.get(ref)
          return Stream.concat(
            Stream.fromIterable(HashMap.values(snap)),
            Stream.fromSubscription(sub),
          )
        }),
      )
      return Vehicles.of({ live })
    }),
  )
}

class FeedGroup extends HttpApiGroup.make('feed').add(
  HttpApiEndpoint.get('vehicles', '/vehicles', {
    success: HttpApiSchema.StreamSse({ data: VehicleState }),
  }),
) {}
class FeedApi extends HttpApi.make('mylder-feed').add(FeedGroup) {}

const FeedHandlers = HttpApiBuilder.group(
  FeedApi,
  'feed',
  Effect.fn(function* (handlers) {
    const vehicles = yield* Vehicles
    return handlers.handleAll({ vehicles: () => Effect.succeed(vehicles.live) })
  }),
)

const Main = HttpRouter.serve(HttpApiBuilder.layer(FeedApi).pipe(Layer.provide(FeedHandlers))).pipe(
  Layer.provide(Vehicles.layer),
  Layer.provide(SiriSource.layer),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
)

Layer.launch(Main).pipe(NodeRuntime.runMain)
```

Notes on the sketch:

- **State primitives.** `SubscriptionRef` is the right home for the snapshot. Its `changes` stream emits the whole map on every update, which is too heavy to send to each browser with a few thousand vehicles. So deltas go through a `PubSub`. `sliding` drops the oldest items for a slow client instead of blocking the poller. A slow client might miss a delta. A later update or a reconnect (which sends a fresh snapshot) repairs it. To cut message count, batch deltas per tick with `Stream.groupedWithin` before sending.
- **Typed SSE.** `HttpApiSchema.StreamSse({ data })` encodes each item with the schema and writes SSE frames. Typed stream errors go out as a reserved failure event that `HttpApiClient` decodes. For a plain route, `HttpServerResponse.stream` plus `Sse.encode()` from `effect/encoding` also works.
- **Subscribing instead of polling.** SIRI publish and subscribe means Rejseplanen POSTs deliveries to us. In Effect that is one more `HttpRouter` POST route whose `request.stream` goes through the same `Xml` pipeline into `Vehicles`. Whether Rejseplanen offers SIRI-ET subscriptions on our tier is not confirmed (it belongs to the API-access ticket).
- **Where the data states come from.** SIRI-ET carries expected and actual stop times, not GPS. Every position computed from it is "Estimated". "Live" needs a vehicle-position feed (SIRI-VM or similar). The ageing thresholds in the sketch follow the README's first guesses.

### XML decoding

`effect/encoding/Xml` (added in 4.0.6, `experimental`) is a streaming XML 1.0 decoder built on Effect channels:

- `Xml.decode()` turns UTF-8 bytes into events. `Xml.decodeString()` does the same for text. `Xml.elements(path)` collects each element at that path into a small tree (`{ name, attributes, children }`). That is the "one record at a time" mode a large feed needs.
- It checks well-formedness. It never reads external resources or expands DOCTYPE entities, so XXE and entity-expansion attacks do not apply. Limits (`maxTokenSize`, `maxDepth`, `maxElementSize`) bound memory.
- It does **not** resolve namespaces. Names come out as written. A SIRI document with a default `xmlns` gives bare names, as in the sketch. One that uses a `siri:` prefix needs the prefix in the path. Check this against a real Rejseplanen response.
- It reads UTF-8 only. Other encodings fail as `Unsupported`.
- A path must start at the root element. NeTEx frames nest deeply and their layout varies between publishers. For NeTEx we may need to walk the raw event stream instead of fixed paths.

There is no decoder that maps XML straight into a `Schema`. `Schema.toEncoderXml` exists, but it only encodes. The pattern is element tree, then a small mapping function, then `Schema.decodeUnknownEffect`, as in the sketch.

Benchmark on this sandbox (Node 22.22): a synthetic 165 MB SIRI-ET file, 60,000 journeys with 12 calls each, read in 64 KB chunks.

| Parser                                                    | Time   | Peak RSS |
| --------------------------------------------------------- | ------ | -------- |
| `Xml.decode` + `Xml.elements` (builds a tree per journey) | 1.97 s | 106 MB   |
| `saxes` 6.0.0 (events only, counts journeys)              | 1.74 s | 90 MB    |

So the Effect parser is fast enough. A real minute-by-minute SIRI-ET response for the Copenhagen area is likely far smaller (unconfirmed until we have API access).

Other inputs:

- **NeTEx** usually arrives zipped. `effect/encoding/Zip` (also new in 4.0.6, `experimental`) streams zip entries, so a NeTEx archive can go zip, then XML events, then records, without unpacking to disk.
- **GTFS** is zipped CSV. `effect/encoding` has no CSV module, so GTFS would need a CSV parser such as `csv-parse`, wrapped in a `Stream`.

### Resource safety, retries, restarts

- **Scopes.** Background fibers start with `Effect.forkScoped` inside `Layer.effect`. They are interrupted when the layer's scope closes. `Layer.launch` keeps the layers alive until the process is interrupted. `NodeRuntime.runMain` handles SIGINT and SIGTERM and runs finalizers. The 4.0 notes list graceful HTTP server shutdown.
- **Retries.** `Effect.retry` with a `Schedule` (exponential, jittered, capped) per poll. `Effect.catchCause` then logs and moves on, so the next tick still runs. The ai-docs show `Schedule.while` on a typed `retryable` field, so we can retry 5xx and timeouts but not 4xx.
- **Restarts.** There is no supervisor tree. Use the pattern above, and use `Stream.retry` for a long-lived subscription stream. A crash outside these loops is a defect, and the process manager restarts it.
- **Budget.** If Rejseplanen really allows about one call a minute, `Schedule.spaced("1 minute")` is the budget. Retries then need their own cap so they cannot overrun it. `Schedule.upTo` handles that.

### Logging, metrics, tracing

- **Logs:** `Logger.layer([Logger.consoleJson])` for structured JSON. `Effect.annotateLogs` adds fields such as the line or journey.
- **Traces:** `Effect.withSpan` and `Effect.fn("name")` create spans. `OtlpTracer.layer`, `OtlpLogger.layer` and `OtlpMetrics` in `effect/observability` export over OTLP/HTTP with no OpenTelemetry SDK. `@effect/opentelemetry` wraps the official SDK if we need it. All `unstable`.
- **Metrics:** `Metric.counter`, `Metric.gauge`, `Metric.histogram` and `Metric.timer` are `stable`. Useful ones: polls ok and failed, journeys per poll, poll duration, vehicles per state, connected SSE clients. `PrometheusMetrics.layerHttp` serves `/metrics` (`unstable`).

## Testing

- `@effect/vitest@4.0.6` needs Vitest 5. The repo has `vitest@^5.0.5`.
- `it.effect` runs each test with `TestClock`. `TestClock.adjust("60 seconds")` fires every `Schedule.spaced` and `Effect.sleep` due in that window at once. `it.live` uses the real clock. `it.effect.prop` runs property tests with Schema arbitraries.
- **Replaying a recorded feed:** save raw SIRI-ET responses as fixtures. In tests, provide a `SiriSource` layer (or an `HttpClient` layer) that streams a fixture in small byte chunks, so chunk boundaries get tested too. For a timeline, keep a list of recorded polls and call `TestClock.adjust` between them. Then assert each data-state change: estimated, ageing at 60 s, lost at 5 min.
- `HttpApiTest` runs an `HttpApi` in memory, without a port, for the SSE endpoint.

These two tests pass here with `@effect/vitest@4.0.6` and `vitest@5.0.5`:

```ts
import { assert, it } from '@effect/vitest'
import { Effect, Fiber, Ref, Schedule, Stream } from 'effect'
import { Xml } from 'effect/encoding'
import { TestClock } from 'effect/testing'

it.effect('decodes a chunked recording one journey at a time', () =>
  Effect.gen(function* () {
    const journeys = yield* Stream.fromIterable(chunks /* recorded bytes, 37-byte slices */).pipe(
      Stream.pipeThroughChannel(Xml.decode()),
      Stream.pipeThroughChannel(Xml.elements(ET_PATH)),
      Stream.runCollect,
    )
    assert.strictEqual(journeys.length, 2)
  }),
)

it.effect('polls on a schedule under TestClock', () =>
  Effect.gen(function* () {
    const polls = yield* Ref.make(0)
    const fiber = yield* Ref.update(polls, (n) => n + 1).pipe(
      Effect.repeat(Schedule.spaced('15 seconds')),
      Effect.forkChild,
    )
    yield* TestClock.adjust('60 seconds')
    assert.strictEqual(yield* Ref.get(polls), 5)
    yield* Fiber.interrupt(fiber)
  }),
)
```

## Client and Next.js

### Effect state in React

The atom library is now part of Effect itself. The atom core is `effect/reactivity` (`Atom`, `AtomRegistry`, `AsyncResult`, `Hydration`, `AtomHttpApi`, `AtomRpc`). The React bindings are `@effect/atom-react` (`useAtomValue`, `useAtom`, `useAtomSet`, `useAtomSuspense`, `RegistryProvider`, `HydrationBoundary`). It is shipped in 4.0 but tagged `unstable`. It needs React 19, which Perron already uses. The older community packages `@effect-atom/atom` and `@effect-atom/atom-react` (0.7.x) peer on `effect@^3`. Do not use them with 4.x.

What it gives Mylder:

- `Atom.make(stream)` turns a `Stream` into an atom whose value is an `AsyncResult` (initial, success or failure). A `Stream.fromEventListener` on an `EventSource`, decoded with `Schema`, becomes the live vehicle atom. `Atom.family` gives one atom per vehicle or stop, so a map marker re-renders only when its own vehicle changes.
- `AtomHttpApi` builds typed query atoms from the same `HttpApi` definition the server uses, SSE endpoints included. Client and server then share the schema.
- `Atom.serializable` plus `Hydration.dehydrate` on the server and `HydrationBoundary` on the client let a server component render the first snapshot and hand it to the live atom without a flash. The hooks file starts with `"use client"`.
- `Atom.swr`, `Atom.refreshOnWindowFocus` and `Atom.searchParam` cover departures boards and URL state.

The simpler option is no Effect on the client at all: `EventSource` plus `useSyncExternalStore`, with the vehicle types generated from the server schemas. That costs 0 kB of Effect.

### Effect inside Next.js

- There is no official Next.js adapter. I checked npm for `@effect/next`, `@effect/nextjs` and `@effect/platform-next`; none exist. The current Next.js is 16.4.3.
- **Route handlers:** `HttpRouter.toWebHandler(layer)` returns a fetch-style `{ handler, dispose }`. `export const GET = (req: Request) => app.handler(req)` serves Effect routes from a Next route. Build it once at module scope.
- **Server actions and server components:** create one `ManagedRuntime.make(AppLayer, { memoMap })` at module scope and call `runtime.runPromise(...)` in each action. The ai-docs show this bridge for other frameworks. In development, keep the runtime on `globalThis` so hot reload does not build a new one on every edit (my inference, not from the Effect docs).
- **Do not run the feed loop inside Next.** The poller and the SSE fan-out need one long-lived process with state in memory. Serverless route handlers are short-lived and can run as many copies. Keep the feed service as its own Node process, as the README already plans. Next renders pages and, at most, proxies `/api/vehicles` to it.

### Bundle-size cost

Measured here with real bundlers, minified, `gzip -9`, React excluded:

| Client code                                                            | rolldown 1.2.15 | esbuild 0.28.2                       |
| ---------------------------------------------------------------------- | --------------- | ------------------------------------ |
| `Effect.runFork(Effect.succeed(1))`, `import { Effect } from "effect"` | 7.4 kB          | 31.2 kB                              |
| Same, `import * as Effect from "effect/Effect"`                        | 7.5 kB          | 9.1 kB                               |
| One `Schema.Struct` and `decodeUnknownSync`                            | 23.4 kB         | 82.8 kB                              |
| `EventSource` stream, Schema decode, `Atom.make`, `useAtomValue`       | 42.1 kB         | 125.8 kB (44.4 kB with deep imports) |

The migration guide's 7.1 kB figure for a minimal program matches rolldown. esbuild tree-shakes the `effect` barrel badly, and deep imports (`effect/Schema`, `effect/reactivity/Atom`) fix most of it. I did not measure Turbopack, the default Next.js 16 bundler. Measure it in the app before deciding. Budget about 40 to 45 kB gzipped for Effect plus Schema plus Atom on the map page.

## Unconfirmed points

- I could not open effect.website from this sandbox. The 4.0 blog post's date (2026-09-30) and LTS dates come from search results that quote it. The repo README, changelog and migration guide (fetched from GitHub) state the same LTS terms.
- No published end date for Effect 3 maintenance was found.
- SIRI namespace prefixes, character encoding and response size from Rejseplanen: unknown until we have API access and a recorded response.
- Whether Rejseplanen offers SIRI-ET publish and subscribe on our tier: unknown.
- Turbopack bundle size: not measured.
- `globalThis` caching of `ManagedRuntime` in Next.js development: my inference.

## Recommendation

For the grilling to push on:

1. **Use Effect 4.x for the feed service, pinned to an exact version** (`4.0.6` today). Bump all Effect packages together. It is the stable LTS line, and 3.x only gets fixes.
2. **Build the service as the four layers above**, as its own Node process with `@effect/platform-node`. Only the source and HTTP layers may touch `unstable` or `experimental` APIs.
3. **Parse SIRI-ET with `effect/encoding/Xml`**, behind `SiriSource`, with a `saxes` fallback ready because `Xml` is experimental. Run the recorded-response test on every Effect bump.
4. **Serve one typed SSE endpoint** with `HttpApiSchema.StreamSse`: snapshot then deltas, through a sliding `PubSub`.
5. **Test with `@effect/vitest` and `TestClock`** from day one, with recorded fixtures replayed in chunks.
6. **On the client, start without Effect.** Use `EventSource` and `useSyncExternalStore`, with types from the shared schemas. Adopt `@effect/atom-react` only if we want `AtomHttpApi`, hydration or `Atom.family`, and only after measuring its size under Turbopack. It costs about 40 kB gzipped and is `unstable`.
7. **Next.js stays thin:** pages, plus `ManagedRuntime` in server actions where a shared Effect service helps. No feed logic in Next.

## Sources

- npm registry, `effect` (dist-tags, release times, 4.0.6 package and exports): https://www.npmjs.com/package/effect
- npm registry, `@effect/atom-react` 4.0.6 (peer `react >=19 <20`): https://www.npmjs.com/package/@effect/atom-react
- npm registry, `@effect/vitest` 4.0.6 (peer `vitest >=5 <6`): https://www.npmjs.com/package/@effect/vitest
- npm registry, `@effect/platform-node`: https://www.npmjs.com/package/@effect/platform-node
- npm registry, `@effect/platform` 0.97.x (v3-era): https://www.npmjs.com/package/@effect/platform
- npm registry, `@effect-atom/atom-react` 0.7.0 (peer `effect ^3.22.1`): https://www.npmjs.com/package/@effect-atom/atom-react
- npm registry, `next` 16.4.3: https://www.npmjs.com/package/next
- npm registry, `saxes` 6.0.0: https://www.npmjs.com/package/saxes
- Effect repo README (LTS terms, package list, v3 branch): https://github.com/Effect-TS/effect/blob/main/README.md
- Migration guide v3 to v4 (versioning, consolidation, stability tags, 7.1 kB): https://github.com/Effect-TS/effect/blob/main/MIGRATION.md
- `effect` changelog (4.0.0 notes, 4.0.6 Xml and Zip): https://github.com/Effect-TS/effect/blob/main/packages/effect/CHANGELOG.md
- 4.0 release notes PR: https://github.com/Effect-TS/effect/pull/8633
- Move `effect/unstable/*` to `effect/*`: https://github.com/Effect-TS/effect/pull/8354
- Add `Xml` to `effect/encoding`: https://github.com/Effect-TS/effect/pull/9420
- Add `Zip` to `effect/encoding`: https://github.com/Effect-TS/effect/pull/9419
- `Xml` module source and docs (read from the 4.0.6 npm tarball): https://github.com/Effect-TS/effect/blob/main/packages/effect/src/encoding/Xml.ts
- `HttpApiSchema.StreamSse`: https://github.com/Effect-TS/effect/blob/main/packages/effect/src/http-api/HttpApiSchema.ts
- `HttpRouter.toWebHandler`: https://github.com/Effect-TS/effect/blob/main/packages/effect/src/http/HttpRouter.ts
- `Atom` (stream atoms, family, serializable): https://github.com/Effect-TS/effect/blob/main/packages/effect/src/reactivity/Atom.ts
- `@effect/atom-react` source: https://github.com/Effect-TS/effect/tree/main/packages/atom/react
- ai-docs examples (ManagedRuntime bridge, `@effect/vitest`, HTTP server, logging, OTLP, schedules): https://github.com/Effect-TS/effect/tree/main/packages/effect/ai-docs/src
- Effect 4.0 release post (via search results only): https://effect.website/blog/releases/effect/40
- Effect v4 beta post, v3 feature freeze (via search results only): https://effect.website/blog/releases/effect/40-beta
- v4 API reference, `HydrationBoundary` (via search results only): https://effect.website/docs/v4/api/atom-react/ReactHydration
