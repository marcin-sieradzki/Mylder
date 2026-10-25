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
          include: [
            'app/**/*.test.ts',
            'src/domain/**/*.test.ts',
            'src/tracker/**/*.test.ts',
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
          setupFiles: ['./src/test/setup.ts'],
          include: [
            'app/**/*.test.{ts,tsx}',
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
