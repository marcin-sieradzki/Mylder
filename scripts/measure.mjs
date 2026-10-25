// Frame-rate measurement in headless Chromium. Run against a production build:
//   npm run build && npm run start   (in another shell)
//   npm run measure
// Writes prototype-screenshots/measurements.json and prints a Markdown table.
// Headless Chromium here renders WebGL in software (SwiftShader), so anything GPU-bound is
// pessimistic; the CPU time per frame spent on positions is the number that carries over.
import { writeFileSync } from 'node:fs'
import { launch, openPrototype, sleep } from './pw.mjs'

const SECONDS = Number(process.env.SECONDS ?? 15)
const COUNT = Number(process.env.COUNT ?? 1500)

const PROFILES = {
  'phone-cpu4': { viewport: { width: 390, height: 844 }, dpr: 3, cpu: 4, z: 10.4 },
  'phone-cpu6': { viewport: { width: 390, height: 844 }, dpr: 3, cpu: 6, z: 10.4 },
  desktop: { viewport: { width: 1440, height: 900 }, dpr: 1, cpu: 1, z: 11.2 },
}

const RUNS = [
  ...['phone-cpu4', 'phone-cpu6', 'desktop'].flatMap((p) =>
    ['a', 'b', 'c'].map((variant) => ({ profile: p, variant, overlay: 'overlaid' })),
  ),
  { profile: 'phone-cpu4', variant: 'a', overlay: 'interleaved' },
  { profile: 'desktop', variant: 'a', overlay: 'interleaved' },
]

const only = process.env.ONLY // e.g. "phone-cpu4:a:overlaid"
const browser = await launch()
const results = []
for (const run of RUNS) {
  const key = `${run.profile}:${run.variant}:${run.overlay}`
  if (only && !key.startsWith(only)) continue
  const prof = PROFILES[run.profile]
  const context = await browser.newContext({ viewport: prof.viewport, deviceScaleFactor: prof.dpr })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu })
  const t0 = Date.now()
  await openPrototype(page, {
    theme: 'light',
    variant: run.variant,
    overlay: run.overlay,
    z: prof.z,
    n: COUNT,
  })
  await sleep(2000)
  await page.evaluate(() => window.mylderProto.reset())
  await sleep(SECONDS * 1000)
  const stats = await page.evaluate(() => window.mylderProto.stats())
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  results.push({
    ...run,
    cpu: prof.cpu,
    dpr: prof.dpr,
    viewport: prof.viewport,
    count: COUNT,
    seconds: SECONDS,
    renderer,
    ...stats,
  })
  console.error(
    `${key}: ${stats.fpsMedian} fps, frame p95 ${stats.frameP95.toFixed(1)} ms, positions ${stats.simMean.toFixed(2)} ms (${(Date.now() - t0) / 1000}s)`,
  )
  await context.close()
}
await browser.close()

writeFileSync('prototype-screenshots/measurements.json', JSON.stringify(results, null, 2))

const row = (r) =>
  `| ${r.profile} | ${r.variant.toUpperCase()} | ${r.overlay} | ${r.fpsMedian} | ${r.frameP50.toFixed(1)} | ${r.frameP95.toFixed(1)} | ${r.simMean.toFixed(2)} | ${r.simP95.toFixed(2)} | ${r.deckMean.toFixed(2)} | ${r.deckP95.toFixed(2)} |`
console.log(
  '| Profile | Variant | Overlay | FPS (median) | Frame p50 ms | Frame p95 ms | Positions mean ms | Positions p95 ms | deck.gl setProps mean ms | setProps p95 ms |',
)
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const r of results) console.log(row(r))
