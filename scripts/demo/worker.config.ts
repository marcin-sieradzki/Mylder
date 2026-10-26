import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// The demo's tracker worker (ADR 0013), bundled into one module script beside the static export.
// The tracker's modules are the server's; the Node built-ins they import stand in as the shims in
// `src/demo/shims/`, and `server-only` as its empty twin, as in the server build.
export default defineConfig({
  // The static export already carries `public/`.
  publicDir: false,
  resolve: {
    alias: {
      'server-only': here('../../node_modules/server-only/empty.js'),
      'node:fs/promises': here('../../src/demo/shims/fs.ts'),
      'node:path': here('../../src/demo/shims/path.ts'),
      'node:crypto': here('../../src/demo/shims/crypto.ts'),
    },
  },
  build: {
    outDir: here('../../out'),
    emptyOutDir: false,
    target: 'es2023',
    minify: true,
    lib: {
      entry: here('../../src/demo/worker.ts'),
      formats: ['es'],
      fileName: () => 'tracker-worker.js',
    },
  },
})
