// Serves the built demo in out/ as GitHub Pages will: under the repository's path, an address
// without an extension taken from its `.html` file, and 404.html for anything missing.
// `npm run demo:serve`, after `npm run demo`; the demo's end-to-end tests run against it.
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const ROOT = 'out'
const BASE_PATH = process.env.MYLDER_DEMO_BASE_PATH ?? '/mylder'
const PORT = Number(process.env.PORT ?? 4175)

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const isFile = async (path: string) => {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function find(pathname: string): Promise<string | undefined> {
  if (!pathname.startsWith(`${BASE_PATH}/`) && pathname !== BASE_PATH) return undefined
  const path = join(ROOT, normalize(decodeURIComponent(pathname.slice(BASE_PATH.length))))
  for (const candidate of [path, `${path}.html`, join(path, 'index.html')]) {
    if (await isFile(candidate)) return candidate
  }
  return undefined
}

createServer(async (request, response) => {
  const found = await find(new URL(request.url ?? '/', 'http://localhost').pathname)
  const file = found ?? join(ROOT, '404.html')
  response.writeHead(found ? 200 : 404, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
  })
  response.end(await readFile(file))
}).listen(PORT, () => console.log(`The demo is at http://localhost:${PORT}${BASE_PATH}/`))
