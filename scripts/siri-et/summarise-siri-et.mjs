// Summarises a recording made by record-siri-et.mjs. Prints no message bodies beyond a few identifier samples.
// Usage: node summarise-siri-et.mjs <outDir>
import fs from 'node:fs'
import path from 'node:path'

const outDir = process.argv[2]
const rows = fs
  .readdirSync(outDir)
  .filter((f) => f.endsWith('-index.jsonl'))
  .flatMap((f) =>
    fs
      .readFileSync(path.join(outDir, f), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  )

const tag = (xml, name) =>
  [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`, 'g'))].map(
    (m) => m[1],
  )
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

const report = {}
for (const phase of [...new Set(rows.map((r) => r.phase))]) {
  for (const dataset of [...new Set(rows.filter((r) => r.phase === phase).map((r) => r.dataset))]) {
    const rs = rows.filter((r) => r.phase === phase && r.dataset === dataset)
    const span =
      (Math.max(...rs.map((r) => r.msSinceStart)) - Math.min(...rs.map((r) => r.msSinceStart))) /
        1000 || 1
    const first30 = rs.filter((r) => r.msSinceStart - rs[0].msSinceStart < 30_000).length
    const enq = rs
      .map((r) => (r.enqueuedTime ? new Date(r.receivedAt) - new Date(r.enqueuedTime) : null))
      .filter((x) => x !== null)
    let journeys = 0,
      calls = 0,
      cancelled = 0,
      extra = 0
    const samples = {
      LineRef: new Set(),
      StopPointRef: new Set(),
      DatedVehicleJourneyRef: new Set(),
      DataFrameRef: new Set(),
      OperatorRef: new Set(),
      VehicleJourneyName: new Set(),
      PublishedLineName: new Set(),
    }
    const journeyKeys = new Set()
    for (const r of rs) {
      const xml = fs.readFileSync(
        path.join(outDir, phase, dataset, `${String(r.n).padStart(6, '0')}.xml`),
        'utf8',
      )
      const evj = xml.split(/<(?:\w+:)?EstimatedVehicleJourney[\s>]/).slice(1)
      journeys += evj.length
      for (const j of evj) {
        calls += (j.match(/<(?:\w+:)?(?:Estimated|Recorded)Call[\s>]/g) ?? []).length
        if (/<(?:\w+:)?Cancellation>true</.test(j)) cancelled++
        if (/<(?:\w+:)?ExtraJourney>true</.test(j)) extra++
        journeyKeys.add(`${tag(j, 'DataFrameRef')[0]}|${tag(j, 'DatedVehicleJourneyRef')[0]}`)
        for (const k of Object.keys(samples))
          for (const v of tag(j, k).slice(0, 2)) if (samples[k].size < 6) samples[k].add(v)
      }
    }
    report[`${phase}/${dataset}`] = {
      messages: rs.length,
      perSecond: +(rs.length / span).toFixed(2),
      messagesInFirst30s: first30,
      xmlBytes: {
        p50: pct(
          rs.map((r) => r.xmlBytes),
          50,
        ),
        p95: pct(
          rs.map((r) => r.xmlBytes),
          95,
        ),
        max: Math.max(...rs.map((r) => r.xmlBytes)),
        total: rs.reduce((a, r) => a + r.xmlBytes, 0),
      },
      gzipped: rs.some((r) => r.gzipped),
      enqueuedToReceivedMs: enq.length ? { p50: pct(enq, 50), max: Math.max(...enq) } : null,
      oldestEnqueued:
        rs
          .map((r) => r.enqueuedTime)
          .filter(Boolean)
          .sort()[0] ?? null,
      journeysPerMessage: +(journeys / rs.length).toFixed(2),
      callsPerJourney: journeys ? +(calls / journeys).toFixed(1) : 0,
      distinctJourneys: journeyKeys.size,
      cancelledJourneyUpdates: cancelled,
      extraJourneyUpdates: extra,
      samples: Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, [...v]])),
      propertiesExample: rs[0]?.properties ?? null,
    }
  }
}
console.log(JSON.stringify(report, null, 2))
