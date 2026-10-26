import type { NextConfig } from 'next'

// The GitHub Pages demo (ADR 0013), built by `npm run demo`: a static export under the
// repository's path. It has no route handlers and no proxy, whose files end in `.ts`, which its
// page extensions leave out; the browser asks its routes of the simulated tracker in a Web Worker
// beside the pages instead.
const demoBasePath = process.env.MYLDER_DEMO_BASE_PATH

const demo: NextConfig =
  demoBasePath === undefined
    ? {}
    : {
        output: 'export',
        basePath: demoBasePath,
        pageExtensions: ['tsx'],
        // `npm run check` type-checks the whole app; here the routes it leaves out have no
        // generated route types.
        typescript: { ignoreBuildErrors: true },
        env: {
          NEXT_PUBLIC_MYLDER_BASE_PATH: demoBasePath,
          NEXT_PUBLIC_MYLDER_TRACKER_WORKER: `${demoBasePath}/tracker-worker.js`,
        },
      }

const nextConfig: NextConfig = {
  // Perron's components come from its barrel, the only entry that exports them; this keeps the
  // bundle to the components a page uses.
  experimental: { optimizePackageImports: ['@mylder/perron'] },
  // The tracker reads the prepared timetable, or a recording, from disk, so its routes' functions
  // carry the files.
  outputFileTracingIncludes: { '/api/**': ['./public/timetable/**', './recordings/**'] },
  ...demo,
}

export default nextConfig
