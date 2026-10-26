# A static demo on GitHub Pages runs the simulated tracker in the browser

Until the Rejseplanen key arrives, and after it, Mylder needs a public demo anyone can open that costs nothing and spends no calls. GitHub Pages serves static files only, while the tracker runs behind Next.js route handlers. So `npm run demo` builds a second target from the same code: Next.js's static export under the repository's path (`/mylder`), with no route handlers and no proxy, and the tracker itself, on the simulated Rejseplanen, bundled with Vite into one Web Worker script beside the pages. The browser's asks for the routes (`src/map/routes.ts`) go to that worker instead of the server, which answers each as the route would, with the same answers and the same date header (`src/demo/`). Every page still shows the simulated banner, because the snapshot names its source.

This amends ADR 0011 for the demo only: Effect runs in the demo's worker, never in the pages' own bundle, and the production build is unchanged.

## Considered Options

- Precomputed answers served as files: the snapshots of a whole day, and every stop's and trip's answers, would be far larger than the timetable and the tracker together, and would loop.
- A service worker in front of the routes: the same tracker, but a first visit isn't under its control until it is installed, so the first asks would fail.
- A second host for the tracker: what ADR 0001 avoids.

## Consequences

- The demo downloads the timetable's trips file (about 4.5 MB, under 1 MB compressed) and the worker (about 80 kB compressed), and runs each minute's run on the visitor's device. Its call counter is the visitor's own and starts empty.
- The tracker's modules stay server modules: in the worker build, `server-only` resolves to its empty twin, and the few Node built-ins they import resolve to the stand-ins in `src/demo/shims/`, which the worker never needs beyond loading. A tracker change that reads files or Node APIs while it runs breaks the demo, which its end-to-end tests catch.
- CI builds the demo on every pull request, runs its end-to-end tests on the static build, and deploys it from `main`, and again after each Timetable run, whose commits start no workflow of their own.
