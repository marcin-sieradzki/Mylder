import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Two projects, as the repo layout settles: server and shared code in Node, the browser's in jsdom.
// A test outside these globs does not run.
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          // The node tests keep no state between files, so they share workers instead of starting
          // one per file. A file that must start clean (a module-level cache it fills, a global it
          // leaves stubbed) cleans up after itself, as `vi.unstubAllEnvs()` does.
          isolate: false,
          // Server modules start with `import 'server-only'`, which throws outside a React Server
          // Components build; its empty twin stands in, as Next.js's server build resolves it.
          alias: {
            'server-only': fileURLToPath(
              new URL('./node_modules/server-only/empty.js', import.meta.url),
            ),
          },
          include: [
            'app/**/*.test.ts',
            'src/domain/**/*.test.ts',
            'src/tracker/**/*.test.ts',
            'src/siri-et/**/*.test.ts',
            'src/demo/**/*.test.ts',
            'src/timetable/**/*.test.ts',
            'src/i18n/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          // Each file still gets its own jsdom, but in a VM context of a shared thread rather than
          // a fresh process, which saves most of the time spent setting them up. CPU-heavy node
          // tests run slower in a VM context, so this is the jsdom project's alone.
          pool: 'vmThreads',
          setupFiles: ['./src/test/setup.ts'],
          include: [
            // `.ts` tests under app/ are the node project's; matching them here ran them twice.
            'app/**/*.test.tsx',
            'src/screens/**/*.test.{ts,tsx}',
            'src/map/**/*.test.{ts,tsx}',
          ],
          css: true,
          // Perron's components import their own CSS, which only Vite can load.
          server: { deps: { inline: ['@mylder/perron'] } },
        },
      },
    ],
  },
})
