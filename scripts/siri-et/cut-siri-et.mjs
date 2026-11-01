// Cuts a recording made by record-siri-et.mjs into a folder of recordings/ for the reader's tests:
// messages.jsonl.gz (one message a line: dataset, receivedAt, body as SIRI XML), the timetable
// beside it and clock.json. Keeps the journeys that call inside the box in any of the window's
// messages, every message about them, and drops the rest.
// A message's receivedAt is its enqueued time at the broker, which a connected listener receives
// within milliseconds; a recorder that starts with a backlog receives it later, all at once.
// Usage: node cut-siri-et.mjs <recorderOutDir> <timetableDir> <outDir> [fromISO] [toISO]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const BOX = { south: 55.4, west: 11.95, north: 56.1, east: 12.8 }

const [recorderDir, timetableDir, outDir, fromArg, toArg] = process.argv.slice(2)
if (!recorderDir || !timetableDir || !outDir) {
  console.error(
    'usage: node cut-siri-et.mjs <recorderOutDir> <timetableDir> <outDir> [fromISO] [toISO]',
  )
  process.exit(2)
}
const from = fromArg ? Date.parse(fromArg) : -Infinity
const to = toArg ? Date.parse(toArg) : Infinity

// Stop refs are compared without leading zeros, as docs/timetable.md does for the API's ids.
const key = (ref) => ref.replace(/^0+(?=.)/, '')
const manifest = JSON.parse(fs.readFileSync(path.join(timetableDir, 'manifest.json'), 'utf8'))
const { stops, platforms } = JSON.parse(
  fs.readFileSync(path.join(timetableDir, manifest.files.stops), 'utf8'),
)
const place = new Map()
for (const p of [...stops, ...platforms]) place.set(key(p.id), p)
const inBox = (p) =>
  p.lat >= BOX.south && p.lat <= BOX.north && p.lon >= BOX.west && p.lon <= BOX.east

const rows = fs
  .readdirSync(recorderDir)
  .filter((f) => f.endsWith('-index.jsonl'))
  .flatMap((f) =>
    fs
      .readFileSync(path.join(recorderDir, f), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  )
  .map((r) => ({ ...r, at: r.enqueuedTime ?? r.receivedAt }))
  .filter((r) => Date.parse(r.at) >= from && Date.parse(r.at) < to)
  .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.dataset.localeCompare(b.dataset))

const journeyPattern = /<EstimatedVehicleJourney>[\s\S]*?<\/EstimatedVehicleJourney>/g
const first = (xml, name) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1] ?? ''
const all = (xml, name) =>
  [...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`, 'g'))].map((m) => m[1])
const journeyId = (j) => `${first(j, 'DataFrameRef')}/${first(j, 'DatedVehicleJourneyRef')}`

const messages = rows.map((r) => ({
  ...r,
  xml: fs.readFileSync(
    path.join(recorderDir, r.phase, r.dataset, `${String(r.n).padStart(6, '0')}.xml`),
    'utf8',
  ),
}))

// First pass: the journeys with a call inside the box in any message.
const wanted = new Set()
const refs = new Map()
for (const m of messages)
  for (const j of m.xml.match(journeyPattern) ?? [])
    for (const ref of all(j, 'StopPointRef')) {
      const p = place.get(key(ref))
      refs.set(ref, p ? (inBox(p) ? 'in' : 'out') : 'unknown')
      if (p && inBox(p)) wanted.add(journeyId(j))
    }

// Second pass: keep those journeys' updates, and the messages that still hold one.
const stats = {}
const lines = []
for (const m of messages) {
  const s = (stats[m.dataset] ??= {
    received: 0,
    kept: 0,
    journeys: 0,
    keptJourneys: 0,
    first: m.at,
    last: m.at,
  })
  s.received++
  let kept = 0
  const body = m.xml.replace(journeyPattern, (j) => {
    s.journeys++
    if (!wanted.has(journeyId(j))) return ''
    kept++
    return j
  })
  if (kept === 0) continue
  s.kept++
  s.keptJourneys += kept
  s.last = m.at
  lines.push(JSON.stringify({ dataset: m.dataset, receivedAt: m.at, body }))
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(
  path.join(outDir, 'messages.jsonl.gz'),
  zlib.gzipSync(lines.join('\n') + '\n', { level: 9 }),
)
fs.cpSync(path.join(timetableDir, 'manifest.json'), path.join(outDir, 'timetable/manifest.json'))
fs.cpSync(
  path.join(timetableDir, manifest.version),
  path.join(outDir, 'timetable', manifest.version),
  { recursive: true },
)
fs.writeFileSync(
  path.join(outDir, 'clock.json'),
  JSON.stringify({ start: new Date(JSON.parse(lines[0]).receivedAt).toISOString() }, null, 2) +
    '\n',
)

const refCounts = { in: 0, out: 0, unknown: 0 }
for (const v of refs.values()) refCounts[v]++
console.log(
  JSON.stringify(
    { box: BOX, journeysKept: wanted.size, stopRefs: refCounts, datasets: stats },
    null,
    2,
  ),
)
