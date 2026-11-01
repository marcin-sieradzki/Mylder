// Cuts a sample from a SIRI-ET recording folder (made by cut-siri-et.mjs) for the reader's tests:
// the messages about the named journeys, each body minus every other journey's
// EstimatedVehicleJourney, and the messages left with none dropped. Written one
// message a line, gzipped as the recording keeps them.
// Usage: node sample-siri-et.mjs <recordingDir> <outFile.jsonl.gz> <DatedVehicleJourneyRef>...
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const [recordingDir, outFile, ...refs] = process.argv.slice(2)
if (!recordingDir || !outFile || refs.length === 0) {
  console.error('usage: node sample-siri-et.mjs <recordingDir> <outFile> <journeyRef>...')
  process.exit(2)
}
const wanted = new Set(refs)

const journeyPattern = /<EstimatedVehicleJourney>[\s\S]*?<\/EstimatedVehicleJourney>/g
const ref = (j) => j.match(/<DatedVehicleJourneyRef>([^<]*)</)?.[1] ?? ''

const lines = zlib
  .gunzipSync(fs.readFileSync(path.join(recordingDir, 'messages.jsonl.gz')))
  .toString('utf8')
  .split('\n')
  .filter(Boolean)

const kept = []
const found = new Set()
for (const line of lines) {
  const message = JSON.parse(line)
  let count = 0
  const body = message.body.replace(journeyPattern, (j) => {
    if (!wanted.has(ref(j))) return ''
    found.add(ref(j))
    count++
    return j
  })
  if (count > 0) kept.push(JSON.stringify({ ...message, body }))
}

fs.writeFileSync(outFile, zlib.gzipSync(kept.join('\n') + '\n', { level: 9 }))
const missing = refs.filter((r) => !found.has(r))
console.log(JSON.stringify({ messages: kept.length, journeys: found.size, missing }, null, 2))
