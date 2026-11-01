// A SIRI-ET recording on disk (recordings/siri-et/README.md): its messages, one a line in
// `messages.jsonl.gz` as `{ dataset, receivedAt, body }`, and the box's stops from the timetable
// beside them.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { Box } from '../timetable/format.ts'
import { readManifest } from '../timetable/manifest.ts'
import { platformId, readStops } from '../timetable/stops.ts'
import type { ReaderBox, SiriEtMessage } from './reader.ts'

/** A recording's messages, in the order they were received. */
export async function readSiriEtMessages(file: string): Promise<SiriEtMessage[]> {
  const text = gunzipSync(await readFile(/* turbopackIgnore: true */ file)).toString('utf8')
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const { dataset, receivedAt, body } = JSON.parse(line) as Record<string, string>
      return { dataset, receivedAt: Date.parse(receivedAt), body }
    })
}

/**
 * The stops and platforms of a timetable folder inside a box, the timetable's own unless another
 * is given.
 */
export async function readBox(timetableDir: string, area?: Box): Promise<ReaderBox> {
  const read = async (name: string): Promise<unknown> =>
    JSON.parse(await readFile(/* turbopackIgnore: true */ join(timetableDir, name), 'utf8'))
  const manifest = readManifest(await read('manifest.json'))
  const { stops, platforms } = readStops(await read(manifest.files.stops))
  const { south, west, north, east } = area ?? manifest.box
  const inside = [...stops, ...platforms].filter(
    ({ lat, lon }) => lat >= south && lat <= north && lon >= west && lon <= east,
  )
  return {
    stops: new Set(inside.map(({ id }) => platformId(id))),
    timetableVersion: manifest.version,
    timezone: manifest.timezone,
  }
}
