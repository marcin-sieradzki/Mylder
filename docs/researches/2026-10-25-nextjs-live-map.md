# Next.js for a client-heavy live map

Research for Mylder, 2026-10-25. Ticket: issue #6.

How to build a page in the current stable Next.js that is mostly a client-side map with about 1,500 vehicles animating all the time, on Perron, Effect and MapLibre with OpenFreeMap tiles.

Research caveat: this sandbox could not open nextjs.org, vercel.com, maplibre.org, osv.dev or Cloudflare's and Netlify's docs. The Next.js docs were read from their source in the vercel/next.js repo at tag `v16.4.3`, which is what nextjs.org renders. MapLibre's docs were read from their source in its repo. Release notes and the security advisory were read on github.com. Versions come from the npm registry. Vercel, Cloudflare and Netlify limits come from search results only, and are marked as such.

## Short answers

1. **Boundary.** Server components hold only the shell: the `[lang]` layout, `<html lang>`, metadata, the app's own strings and any first data. Everything live is a client component: the map, every side panel, the City pulse stats, the virtualised list and the disruptions. Put the map in the layout, not in a page, so it stays mounted while panels change.
2. **Perron without `'use client'`.** Confirmed: no file in `packages/perron/src` has the directive. Importing `@mylder/perron` from a server component fails at once, because `PerronProvider.tsx` calls `createContext` when the barrel loads and React's server build has no `createContext`. Every component also calls hooks. The fix that lasts is for Perron to put `'use client'` at the top of each component file and of `PerronProvider.tsx`, but not on the barrels. Until then, the app imports Perron only from its own client modules. A `'use client'` file that does `export * from '@mylder/perron'` is rejected by Next's loader; named re-exports work. `transpilePackages` does not add directives. It is needed only for Perron's raw `tokens.ts` export.
3. **Long-lived streams.** A route handler can stream Server-Sent Events with a `ReadableStream`. It cannot accept a WebSocket: Next.js has no upgrade API. With `next start` in a container, an SSE handler lives as long as the connection does. On Vercel, a function is cut at its maximum duration, 300 s on Hobby and up to 800 s on Pro (search results, unconfirmed). Vercel's WebSocket support (public beta since June 2026) is for plain functions, not Next.js routes. Keep the feed in its own Node service, as the README plans, and let browsers connect to it directly.
4. **English and Danish.** Use the App Router pattern: everything under `app/[lang]`, a `proxy.ts` that redirects `/` by `Accept-Language`, `generateStaticParams` for `en` and `da`, and server-side dictionaries. Next.js 16.3 added `next/root-params`, so server code reads `lang` without prop drilling. Pass `lang` to `PerronProvider`, whose `Locale` type is `'en' | 'da' | 'sv' | 'nb'`, so the route segment can be that type directly.
5. **MapLibre.** Create the map only in a client component, inside an effect, since `new Map()` needs `document`. Load that component with `next/dynamic` and `{ ssr: false }` from a client module, because `ssr: false` is not allowed in a server component. MapLibre 6 (July 2026) is ESM-only and needs one `setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString())` call; its docs say Next.js 15+ emits the worker as a hashed asset under Turbopack and webpack.
6. **React 19 and the React Compiler.** The App Router runs the React canary that Next bundles: `19.3.0-canary-278794d7-20261002` in Next 16.4.3. The React Compiler is stable in Next since 16.0 (`reactCompiler: true`) but off by default. 16.3 added an experimental native Rust compiler for Turbopack.
7. **Version and recent changes.** Current stable is Next.js **16.4.3** (2026-10-23). What matters here: Turbopack is the default bundler since 16.0; Cache Components (`cacheComponents: true`) is the caching model, opt-in, and on in new `create-next-app` projects since 16.4; Partial Prerendering now lives inside Cache Components; Partial Prefetching arrived in 16.3; the Edge runtime is deprecated since 16.3; `middleware` is now `proxy`.

## 1. Where the server/client boundary sits

### What the docs say

`'use client'` marks a module as an entry point to the client graph. Everything it imports goes to the client bundle. Server components can still sit inside a client component when they are passed as `children` or other props, because they arrive as rendered output, not code. Props that cross the boundary must be serializable, so a server component cannot pass an `onClick`. Context is not available in server components; a provider must be a client component. ([Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary))

A client component still renders on the server to HTML on the first visit, then hydrates. Only `next/dynamic` with `ssr: false`, or React 19.3's `use(browser())`, keeps it out of the server render. ([Single-Page Applications](https://nextjs.org/docs/app/guides/single-page-applications#rendering-components-only-in-the-browser))

With Cache Components on, Next keeps a page you navigate away from mounted but hidden in React's `<Activity>`. Its effects are cleaned up while hidden and run again when it comes back. ([cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents#navigation-with-activity)) For a map that lives in a page, that would mean `map.remove()` and a fresh map on every round trip. A layout is not re-rendered on navigation, so the map belongs there.

### Proposed split for Mylder

| Part                                      | Where                               | Why                                                                                                                                                           |
| ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/[lang]/layout.tsx`                   | Server                              | Sets `<html lang>`, loads `@mylder/perron/perron.css`, reads the dictionary, renders the client `Providers` and `MapShell`.                                   |
| `Providers` (`PerronProvider`, store)     | Client                              | Context needs a client component. Holds the one Effect runtime and the feed store.                                                                            |
| `MapShell` and the map                    | Client, map via `ssr: false`        | WebGL, `window`, 1,500 moving features. The server render gives a sized empty frame.                                                                          |
| Vehicle detail, stop departures           | Client                              | They show live data from the stream. A server page may pass in the stop's name and the strings, nothing live.                                                 |
| City pulse stats                          | Client                              | Counts change every update. The first HTML can show Perron's `Stat` with no value, which renders "—" and says "Unknown", which is honest before data arrives. |
| Virtualised vehicle list                  | Client                              | Virtualisation measures the DOM and follows scroll. Server-rendering 1,500 rows would defeat it.                                                              |
| Disruptions                               | Client, optional server first paint | They change slowly. A server component could fetch the first list and stream it, but it comes from the same feed, so client-only is simpler.                  |
| Static pages (about, data, accessibility) | Server                              | Text only. Perron components inside them still need client modules (section 2).                                                                               |

Selection state (which vehicle or stop is open) fits in search params, written with `window.history.pushState`. Next keeps `useSearchParams` in sync and makes no server request, so opening a panel is instant and the URL can be shared. ([Shallow routing on the client](https://nextjs.org/docs/app/guides/single-page-applications#shallow-routing-on-the-client)) Separate routes such as `/[lang]/stop/[id]`, or a parallel `@panel` slot, would cost a server round trip per click. Since Next 16, every parallel slot also needs a `default.js` or the build fails. ([Version 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16#parallel-routes-defaultjs-requirement))

The animation loop must not run through React state. 1,500 vehicles at 60 frames a second is far too many renders. The loop updates MapLibre (or deck.gl) directly in `requestAnimationFrame`. React only renders the panels, at the feed's pace or slower.

## 2. Perron in a framework with server components

### What Perron ships today (verified)

- `grep -r "use client" packages/perron/src` finds nothing. There is no built `dist/` in the clone either.
- The package builds with plain `tsc` (`tsconfig.build.json`) and `scripts/copy-css.ts`. tsc keeps a file's directive prologue, so a `'use client'` written in a source file would reach `dist/` as is.
- Exports: `.` (`dist/index.js`) and `./patterns` (`dist/patterns.js`), both generated barrels of `export * from './components/...'`; CSS files; `./tokens.ts`, which points at a raw TypeScript file; JSON, icons and logos.
- `PerronProvider.tsx` calls `createContext` at module level. `index.ts` imports it, so loading the barrel creates a context.
- All 52 component files call hooks: `useOwnedStrings` (which calls `useContext`), Base UI's `useRender`, or Base UI parts.
- Each component imports its own CSS (`import './Stat.css'`), and `sideEffects` lists `**/*.css`.
- Base UI 1.9.0 itself does ship `'use client'`: 420 of its 841 JS files carry it. Perron's own modules sit above Base UI, so that does not help.
- On npm, `@mylder/perron` 0.1.0 has only the foundations. The components arrive with 0.2.0, which is not yet published.

### What breaks when a server component imports it

In a server component, `react` resolves to React's server build. In the build Next 16.4.3 bundles, that build has no `createContext`, `useContext`, `useState`, `useEffect` or `useRef` (checked in `next/dist/compiled/react`). So:

1. `import { Stat } from '@mylder/perron'` in a server file loads the barrel, which runs `createContext` and throws. Next rewrites the error to "createContext only works in Client Components. Add the "use client" directive at the top of the file to use it." (`next/dist/lib/format-server-error.js`). Every import from the main entry fails this way, even of a component that would otherwise be harmless.
2. Without the barrel, any component would still throw on its first hook call.

The docs describe the same case for a third-party carousel: it works inside a client component and throws inside a server component. ([Third-party components](https://nextjs.org/docs/app/getting-started/server-and-client-components#third-party-components))

### The options

| Option                                                                                                       | Works?          | Cost                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Import Perron only from the app's own `'use client'` files                                                   | Yes             | No library change. Every server file that wants a `Button` needs a client wrapper. This is the docs' own advice for libraries without the directive.                                                                                                                                                                                                                                                                                                                     |
| One client module that re-exports Perron: `'use client'; export { Button, Stat, ... } from '@mylder/perron'` | Yes, named only | `export *` in a `'use client'` file is rejected: "It's currently unsupported to use "export \*" in a client boundary. Please use named exports instead." (Next's flight loader). The list must be kept in step with Perron by hand. Compound parts such as `Dialog.Root` cross fine as one export. Unconfirmed whether Turbopack gives the same error; the check read is in the webpack loader.                                                                          |
| Perron adds `'use client'` to each component file and to `PerronProvider.tsx`                                | Yes, best       | The docs ask this of component libraries: put the directive on the entry points that use client features, so users can import from server components without wrappers. Keep it off `index.ts` and `patterns.ts`, so a server file can import the barrel and get client references, as Base UI does. tsc keeps the directive, so no build tool change. `npm run registry` writes the barrels, so it could also check that every component file starts with the directive. |
| `transpilePackages: ['@mylder/perron']`                                                                      | No, for this    | It compiles and bundles a package's code. It does not mark anything as client. Turbopack already compiles workspace packages. It is needed only if the app imports `@mylder/perron/tokens.ts`, a raw `.ts` file, because Next does not compile `node_modules` by default.                                                                                                                                                                                                |

Two smaller points:

- **CSS.** Next allows stylesheets from external packages to be imported anywhere in `app/`. ([CSS: External stylesheets](https://nextjs.org/docs/app/getting-started/css#external-stylesheets)) Perron's per-component `import './X.css'` from its own `dist/` JS should therefore work, but this was not tested here. A spike should check it. The docs also warn that global CSS is not removed on navigation, which is fine for Perron's tokens and component styles.
- **Tree shaking the barrel.** `experimental.optimizePackageImports` loads only the modules used from a package with many re-exports. It is still experimental. Turbopack's own tree shaking may make it unneeded; untested.

## 3. Long-lived SSE or WebSocket streams

### Next.js itself

- Route handlers can stream any `ReadableStream` as a `Response`, and the docs name Server-Sent Events as a use. ([Streaming in Route Handlers](https://nextjs.org/docs/app/guides/streaming#streaming-in-route-handlers))
- WebSockets: the docs say that on hosts that deploy route handlers as functions, "WebSockets won't work because the connection closes on timeout, or after the response is generated". ([Backend for Frontend: Deployment environment](https://nextjs.org/docs/app/guides/backend-for-frontend)) Next has no route-level upgrade API. Search results point to a community package that adds an `UPGRADE` export by patching Next; it is not official.
- `maxDuration` is a route segment option that platforms read to cap a function's run time. ([maxDuration](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/maxDuration))
- With Cache Components on, `GET` route handlers prerender like pages unless they touch request data or uncached I/O. An SSE handler must read the request (such as `request.signal`) or call `connection()` so it is not prerendered at build. ([Route Handlers with Cache Components](https://nextjs.org/docs/app/getting-started/route-handlers#with-cache-components))
- Security: CVE-2026-44578 (GHSA-c4j6-fc7j-m34r, high) let crafted WebSocket upgrade requests make a self-hosted `next start` server proxy requests to arbitrary hosts. Fixed in 15.5.16 and 16.2.5. Vercel-hosted apps were not affected. ([advisory](https://github.com/advisories/GHSA-c4j6-fc7j-m34r)) Any version from 16.4 on is patched; a self-hosted proxy can still block upgrade requests to the Next app if none are needed.

### By host

| Host                                       | SSE from a route handler                                                                                                                                                                                | WebSocket                                                                                                                                                                                                            | Source                                                                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next start` on a Node server or container | Yes, for as long as the client stays connected. Proxies in front must not buffer: nginx needs `X-Accel-Buffering: no`; some load balancers buffer by default.                                           | Not in a route handler. Possible only in a custom server (`server.js` with `ws`), which cannot be combined with `output: 'standalone'` and is not compiled by Next.                                                  | [Self-hosting](https://nextjs.org/docs/app/guides/self-hosting#streaming-and-suspense), [Deploying](https://nextjs.org/docs/app/getting-started/deploying), [Custom server](https://nextjs.org/docs/app/guides/custom-server)            |
| Vercel                                     | Yes, until the function's maximum duration: 300 s on Hobby; 300 s default and 800 s max on Pro and Enterprise; 1,800 s in beta for some runtimes. The browser's `EventSource` reconnects after the cut. | Vercel Functions gained WebSockets in public beta on 2026-06-22, on Fluid compute, closed at the maximum duration. Per search results, Vercel's own page says Next.js does not expose an API for WebSocket upgrades. | Search results only, unconfirmed: [limits](https://vercel.com/docs/functions/limitations), [WebSockets](https://vercel.com/docs/functions/websockets), [changelog](https://vercel.com/changelog/websocket-support-is-now-in-public-beta) |
| Cloudflare (OpenNext adapter)              | Incoming HTTP requests have no wall-clock limit while the client is connected; CPU time is capped (30 s default on paid).                                                                               | Through Durable Objects, outside Next.js routes.                                                                                                                                                                     | Search results only: [Workers limits](https://developers.cloudflare.com/workers/platform/limits)                                                                                                                                         |
| Netlify                                    | Streaming functions are capped at about 10 s in the docs; a forum post says 30 s. Too short either way.                                                                                                 | No.                                                                                                                                                                                                                  | Search results only, conflicting: [Netlify functions](https://docs.netlify.com/build/functions/api)                                                                                                                                      |
| Fly.io, Railway, Render, Cloud Run, a VPS  | Yes, as `next start`. Cloud Run has its own request timeout (not checked).                                                                                                                              | Yes in a separate process.                                                                                                                                                                                           | [Deploying](https://nextjs.org/docs/app/getting-started/deploying) templates                                                                                                                                                             |

Next.js 16.3 also deprecated the Edge runtime, so new handlers should not use `runtime = 'edge'`. ([runtime](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/runtime), [v16.3.0 release](https://github.com/vercel/next.js/releases/tag/v16.3.0))

### What this means for Mylder

The README's plan already keeps the feed out of Next: one Node server polls Rejseplanen about once a minute, keeps state in memory, and fans it out over SSE. That needs one long-lived process with shared memory. A route handler on a function host cannot be that, because each viewer may land on a different instance and every connection is cut at the time limit. So:

- The feed service stays its own Node (Hono) process.
- Browsers open `EventSource` straight to it, on its own subdomain with CORS, or on the same origin through a reverse proxy that routes `/feed` to it without buffering.
- The Next app then has no long-lived work and can run anywhere: in the same container platform as the feed, or on Vercel.
- SSE is enough. The browser only listens. SSE reconnects on its own and passes `Last-Event-ID`, so the feed can resend what was missed.

## 4. English and Danish routing

The App Router has no built-in i18n config (that was the Pages Router). The documented pattern: ([Internationalization](https://nextjs.org/docs/app/guides/internationalization))

1. All routes under `app/[lang]/`. The root layout can live there too, so it can set `<html lang>`.
2. A `proxy.ts` (renamed from `middleware.ts` in 16.0) that redirects a path without a locale to one picked from `Accept-Language`.
3. `generateStaticParams` returning `[{ lang: 'en' }, { lang: 'da' }]`, so the shells prerender.
4. A `server-only` `getDictionary` that dynamic-imports `en.json` or `da.json`, and `hasLocale` to give a 404 for anything else.
5. Since 16.3, `next/root-params` gives server code a `lang()` getter, so a utility can read the locale without it being passed down. It does not work in client components, server actions or route handlers. ([next/root-params](https://nextjs.org/docs/app/api-reference/functions/next-root-params))

Libraries are listed as alternatives, among them `next-intl` (4.14.9, peer range includes Next 16).

How Perron plugs in, from its source (`packages/perron/src/locale/index.ts`, `PerronProvider.tsx`):

- `Locale` is `keyof typeof dictionaries`, that is `'en' | 'da' | 'sv' | 'nb'`. Mylder's `[lang]` segment can be typed as `Extract<Locale, 'en' | 'da'>`, and the same `hasLocale` check guards both.
- `PerronProvider` takes `locale` and gives components their owned strings (close labels, "Live", "Kører normalt", units) and the locale for `Intl.NumberFormat`. It must sit in a client module, wrapped once in the `[lang]` layout: `<Providers lang={lang}>`.
- Perron imports all four dictionaries statically, so all four go into the client bundle. They are short; not an issue now.
- The app's own strings (panel titles, empty states) come from the server dictionary. Pass only the strings a client component needs as props, or put a slice in a client context next to `PerronProvider`.
- Changing `/en` to `/da` changes the root segment, so the layout under `[lang]` mounts again and the map is rebuilt. Rare, acceptable.
- Not covered here: map label language. OpenFreeMap's styles choose the name field; switching it per locale is a MapLibre style question.

## 5. Loading MapLibre GL JS safely

- **Current version:** `maplibre-gl` 6.16.0 (published today; 6.0.0 came out 2026-07-22). The React wrapper `@vis.gl/react-maplibre` 8.1.3 accepts `maplibre-gl >= 4`.
- **6.0 is ESM-only.** No UMD, no CommonJS, no separate CSP build. `import maplibregl from 'maplibre-gl'` must become named imports or `import * as maplibregl`. WebGL 2 is required. ([MapLibre changelog 6.0.0](https://github.com/maplibre/maplibre-gl-js/blob/main/CHANGELOG.md), [v5 to v6 guide](https://github.com/maplibre/maplibre-gl-js/blob/main/docs/guides/v5-to-v6-migration-guide.md))
- **Worker.** With a bundler, call `setWorkerUrl()` once. MapLibre's install docs give the Next.js (Turbopack) form, in a `'use client'` file: `setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString())`. They say Next.js 15 and later emits the worker as a hashed asset in both `next build` and `next build --webpack`. A self-hosted worker means the CSP needs only `worker-src 'self'`. ([MapLibre installation](https://github.com/maplibre/maplibre-gl-js/blob/main/docs/index.md))
- **Server render.** Tested here in Node with 6.15.0: importing the module and calling `setWorkerUrl` work without a DOM; `new Map()` throws "document is not defined". So create the map in `useEffect` (or a ref callback) and `remove()` it in the cleanup.
- **Keep it out of the server render anyway.** The main bundle is about 1.1 MB (290 kB gzipped), the worker 520 kB (147 kB gzipped). Load the map component with `next/dynamic(() => import('./Map'), { ssr: false })`. This must be called in a client module; a server component that uses `ssr: false` is an error. ([Lazy loading](https://nextjs.org/docs/app/guides/lazy-loading)) Give the frame a fixed size so nothing shifts when the map appears.
- **Styles.** `import 'maplibre-gl/dist/maplibre-gl.css'` works from any file in `app/`.
- **Strict Mode.** Development mounts effects twice, so the effect must clean up the map and the `EventSource` it opens.

## 6. React 19 and the React Compiler in Next

- The App Router uses the React canary that Next bundles, not the app's `react` package. Next 16.4.3 bundles `19.3.0-canary-278794d7-20261002`. The stable npm release is `react` 19.3.1, which Mylder already uses. ([Version 16 guide: React 19.2](https://nextjs.org/docs/app/guides/upgrading/version-16#react-192), [v16.4.0 release](https://github.com/vercel/next.js/releases/tag/v16.4.0))
- The React Compiler (`babel-plugin-react-compiler` 1.0.0, October 2025) is a stable, top-level `reactCompiler` option since Next 16.0. It is not on by default. Next runs it only on files with JSX or hooks to keep builds fast. `compilationMode: 'annotation'` makes it opt-in per component with `'use memo'`. ([reactCompiler](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler))
- 16.3 added `experimental.turbopackRustReactCompiler`, a native port that runs inside Turbopack without the Babel plugin. Experimental. ([turbopackRustReactCompiler](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackRustReactCompiler))
- For Mylder, the compiler helps the panels and the list, which re-render on each feed update. It does nothing for the map loop, which should not go through React at all. Unconfirmed whether Next applies the compiler to Perron's code in `node_modules`; Perron itself is built with plain tsc.

## 7. Current version and what changed

- `npm view next dist-tags`: `latest` is **16.4.3** (2026-10-23); 16.4.0 came out 2026-10-06; `canary` is 16.5.0-canary.27. Node 20.9+ is required.
- **16.0 (October 2025):** Turbopack is the default for `next dev` and `next build`; a custom `webpack` config makes `next build` fail unless you opt out with `--webpack`. `cacheComponents` became a top-level option and absorbed PPR, `useCache` and `dynamicIO`. `reactCompiler` became stable. `middleware` was renamed `proxy`, which runs on Node only. Async `params` and `searchParams`. ([Version 16 guide](https://nextjs.org/docs/app/guides/upgrading/version-16))
- **16.3 (August 2026):** Partial Prefetching (`partialPrefetching`, needs Cache Components), `next/root-params`, Node streams by default, the Edge runtime deprecated, and Turbopack's experimental React Compiler. ([v16.3.0 release](https://github.com/vercel/next.js/releases/tag/v16.3.0))
- **16.4 (October 2026):** Cache Components is the recommended model and on in new `create-next-app` projects; existing apps opt in with `cacheComponents: true` and `partialPrefetching: true`. Durable `use cache` entries now work with client components. ([v16.4.0 release](https://github.com/vercel/next.js/releases/tag/v16.4.0), [Caching](https://nextjs.org/docs/app/getting-started/caching)) Search results mention a 16.4 blog post; it could not be opened.

What Cache Components means for a live map: data is dynamic by default and you choose what to cache with `use cache`. The build prerenders a static shell and streams the rest. For Mylder, the shell is the `[lang]` layout, the panel frames and the strings, and none of the live data. Cache Components does not support the `runtime` segment option, and its `<Activity>` navigation keeps hidden pages mounted (section 1). It needs a host that streams; `next start` does. ([Deploying to platforms](https://nextjs.org/docs/app/guides/deploying-to-platforms))

## Recommendation

For the grilling to push on:

1. **Next.js 16.4.x with Turbopack, Cache Components and Partial Prefetching on**, as a new app would start. Almost nothing on the page is cached, but the static `[lang]` shell is a cheap first paint, and starting on the default avoids a migration later.
2. **One route per locale for the map**, `app/[lang]/page.tsx`, with the map in `app/[lang]/layout.tsx` through a client `MapShell` that loads MapLibre with `ssr: false`. Panels open from search params via `history.pushState`, with no server round trip. Content pages (about, data sources) are ordinary server routes.
3. **Perron adds `'use client'` to every component file and to `PerronProvider.tsx`, not to the barrels**, with a registry check, before 0.2.0 is published. Until then, Mylder imports Perron only inside its own client modules. No `transpilePackages` unless the app imports `tokens.ts`; the CSS variables in `perron.css` may be enough.
4. **The feed stays a separate Node service speaking SSE.** Browsers connect to it directly. No streams in Next route handlers.
5. **Host both as containers on one platform** (for example Fly.io, Railway or Render), the Next app with `output: 'standalone'` and `next start`. Vercel stays possible for the Next app alone, with the feed elsewhere. Netlify's limits rule out streaming there.
6. **i18n by hand, per the Next.js guide:** `[lang]` limited to `en` and `da`, `proxy.ts` for the first redirect, JSON dictionaries read with `next/root-params`, `lang` passed to `PerronProvider`. Reach for `next-intl` only if plurals and formatting outgrow `Intl`.
7. **React Compiler on** (`reactCompiler: true`), Babel plugin first, the Rust port once it leaves experimental. The animation runs outside React either way.
8. **Spike first:** a Next 16.4 app that imports a built Perron 0.2.0 with directives, renders a `Dialog` and a `Stat` from a server page, mounts MapLibre 6 with OpenFreeMap tiles and 1,500 moving points, and reads a local SSE feed. It settles the untested points: Perron's CSS from `dist/`, Turbopack's handling of `export *` in a client file, and the frame rate.

Open questions: is a Next app worth it at all, when nearly everything is client-side and the current shell is Vite? What it buys is i18n routing, a server-rendered shell with metadata per locale, and server components for the text pages. The cost is the boundary rules above and a Node server to run.

## Sources

Next.js docs, read from source at tag `v16.4.3` (nextjs.org could not be opened from the sandbox; the links go to the rendered pages):

- Server and Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components (source: https://github.com/vercel/next.js/blob/v16.4.3/docs/01-app/01-getting-started/05-server-and-client-components.mdx)
- The Server and Client Boundary: https://nextjs.org/docs/app/guides/server-and-client-boundary
- `'use client'` directive: https://nextjs.org/docs/app/api-reference/directives/use-client
- Single-Page Applications: https://nextjs.org/docs/app/guides/single-page-applications
- Lazy loading: https://nextjs.org/docs/app/guides/lazy-loading
- CSS: https://nextjs.org/docs/app/getting-started/css
- `transpilePackages`: https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages
- `optimizePackageImports`: https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports
- Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Streaming: https://nextjs.org/docs/app/guides/streaming
- Backend for Frontend: https://nextjs.org/docs/app/guides/backend-for-frontend
- `maxDuration`: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/maxDuration
- `runtime`: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/runtime
- Self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- Deploying: https://nextjs.org/docs/app/getting-started/deploying
- Deploying to platforms: https://nextjs.org/docs/app/guides/deploying-to-platforms
- Internationalization: https://nextjs.org/docs/app/guides/internationalization
- `next/root-params`: https://nextjs.org/docs/app/api-reference/functions/next-root-params
- Caching: https://nextjs.org/docs/app/getting-started/caching
- `cacheComponents`: https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents
- `partialPrefetching`: https://nextjs.org/docs/app/api-reference/config/next-config-js/partialPrefetching
- `reactCompiler`: https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler
- `turbopackRustReactCompiler`: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackRustReactCompiler
- Version 16 upgrade guide: https://nextjs.org/docs/app/guides/upgrading/version-16

Next.js releases, code and advisories:

- v16.4.0 release notes: https://github.com/vercel/next.js/releases/tag/v16.4.0
- v16.3.0 release notes: https://github.com/vercel/next.js/releases/tag/v16.3.0
- `export *` client boundary check: `next/dist/build/webpack/loaders/next-flight-loader/index.js` in `next@16.4.3` (https://github.com/vercel/next.js/tree/v16.4.3/packages/next/src/build/webpack/loaders/next-flight-loader)
- Server error rewrite for hooks and `createContext`: `next/dist/lib/format-server-error.js` in `next@16.4.3`
- GHSA-c4j6-fc7j-m34r / CVE-2026-44578: https://github.com/advisories/GHSA-c4j6-fc7j-m34r
- npm registry: https://www.npmjs.com/package/next (versions and dates via `npm view next time`)

MapLibre:

- Changelog: https://github.com/maplibre/maplibre-gl-js/blob/main/CHANGELOG.md
- v5 to v6 migration guide: https://github.com/maplibre/maplibre-gl-js/blob/main/docs/guides/v5-to-v6-migration-guide.md
- Installation (per-bundler worker setup): https://github.com/maplibre/maplibre-gl-js/blob/main/docs/index.md (rendered at https://maplibre.org/maplibre-gl-js/docs/)
- npm: https://www.npmjs.com/package/maplibre-gl, https://www.npmjs.com/package/@vis.gl/react-maplibre

Hosts (search results only; pages not opened):

- Vercel Functions limits: https://vercel.com/docs/functions/limitations
- Vercel Fluid compute: https://vercel.com/docs/fluid-compute
- Vercel WebSockets: https://vercel.com/docs/functions/websockets
- Vercel changelog, WebSockets public beta: https://vercel.com/changelog/websocket-support-is-now-in-public-beta
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits
- Netlify Functions: https://docs.netlify.com/build/functions/api

Perron (read in its source):

- `packages/perron/package.json`, `tsconfig.build.json`, `scripts/copy-css.ts`
- `packages/perron/src/index.ts`, `PerronProvider.tsx`, `locale/index.ts`, `locale/da.ts`, `components/*/*.tsx`
- `@base-ui/react` 1.9.0 package files (directive count)

Other:

- next-intl: https://next-intl.dev (version and peer range via `npm view next-intl`)
