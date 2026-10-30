// Drives one journey against a run's server in Chromium and keeps its evidence.
// Usage: node .claude/skills/verify-mylder/scripts/drive.ts <run-id> <journey.ts> [--phone]
//
// A journey is a module whose default export is `async ({ page, step, expect }) => {}`: `page` is
// a Playwright page on the run's server (relative paths such as '/en' work), `expect` is
// Playwright's, and `step(name)` saves a screenshot and the page's ARIA snapshot as the next
// numbered pair. Everything goes to .verify/<run-id>/<journey>/, with result.json (pass or fail,
// the error, and every step) and console.txt, the page's console. Exits 0 on a pass, 1 on a fail.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, devices, expect, type Page } from '@playwright/test'

export interface Journey {
  page: Page
  step: (name: string) => Promise<void>
  expect: typeof expect
}

const [run, journeyPath, ...flags] = process.argv.slice(2)
if (!run || !journeyPath) {
  console.error('usage: drive.ts <run-id> <journey.ts> [--phone]')
  process.exit(2)
}
const port = readFileSync(join('.verify', run, 'port'), 'utf8').trim()
const name = basename(journeyPath).replace(/\.ts$/, '')
const out = join('.verify', run, name)
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
})
const context = await browser.newContext({
  ...(flags.includes('--phone') ? devices['Pixel 7'] : devices['Desktop Chrome']),
  baseURL: `http://localhost:${port}`,
})
const page = await context.newPage()
const console_: string[] = []
page.on('console', (message) => console_.push(`${message.type()}: ${message.text()}`))
page.on('pageerror', (error) => console_.push(`pageerror: ${error.message}`))

const steps: string[] = []
const step = async (stepName: string) => {
  const file = `${String(steps.length + 1).padStart(2, '0')}-${stepName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
  await page.screenshot({ path: join(out, `${file}.png`) })
  writeFileSync(join(out, `${file}.aria.yml`), await page.locator('body').ariaSnapshot())
  steps.push(`${file}: ${stepName} (${page.url()})`)
}

let error: string | undefined
try {
  const journey = (await import(pathToFileURL(resolve(journeyPath)).href)) as {
    default: (j: Journey) => Promise<void>
  }
  await journey.default({ page, step, expect })
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught)
  await step('failure').catch(() => {})
}
await browser.close()

writeFileSync(join(out, 'console.txt'), console_.join('\n'))
writeFileSync(
  join(out, 'result.json'),
  JSON.stringify({ journey: name, pass: !error, error, steps }, null, 2),
)
console.log(`${error ? 'FAIL' : 'PASS'} ${name}: ${steps.length} steps in ${out}/`)
if (error) console.log(error)
process.exit(error ? 1 : 0)
