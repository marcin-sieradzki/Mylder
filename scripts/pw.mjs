// Shared bits for the measurement and screenshot scripts: launch headless Chromium, open the
// prototype with the given URL params, and wait until the map's tiles have loaded.
import { existsSync } from 'node:fs'

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

export async function launch() {
  // Playwright from the project if installed, else from the environment's global install.
  const candidates = ['playwright', '/opt/node-tools/node_modules/playwright/index.mjs']
  let pw
  for (const c of candidates) {
    try {
      if (c.startsWith('/') && !existsSync(c)) continue
      pw = await import(c)
      break
    } catch {
      // try the next one
    }
  }
  if (!pw) throw new Error('Playwright not found: npm i -D playwright')
  return pw.chromium.launch()
}

export function prototypeUrl(params) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null) q.set(k, String(v))
  return `${BASE_URL}/prototype/map?${q.toString()}`
}

export async function openPrototype(page, params) {
  await page.goto(prototypeUrl(params), { waitUntil: 'load' })
  await page.waitForFunction(() => window.mylderProto?.tilesLoaded === true, null, {
    timeout: 90_000,
  })
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
