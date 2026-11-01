// A SIRI-ET recording on disk (recordings/siri-et/README.md): its messages, one a line in
// `messages.jsonl.gz` as `{ dataset, receivedAt, body }`, and the box's stops from the timetable
// beside them.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { Box } from '../timetable/format.ts'
import { boxOf, stopsFileOf } from './box.ts'
import type { ReaderBox, SiriEtMessage } from './reader.ts'

/** A recording's messages, in the order they were received. */
export async function readSiriEtMessages(file: string): Promise<SiriEtMessage[]> {
  const text = gunzipSync(await readFile(/* turbopackIgnore: true */ file)).toString('utf8')
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map(message)
}

/**
 * A recording's messages read as a clock reaches them: each call gives the messages received up to
 * `now` that no earlier call gave, in order. Each line is read only when its turn comes, so the
 * whole recording, 114 MB of XML, is held once, as the bytes of its file.
 */
export async function siriEtReplay(file: string): Promise<(now: number) => SiriEtMessage[]> {
  const bytes = gunzipSync(await readFile(/* turbopackIgnore: true */ file))
  let from = 0
  let pending: SiriEtMessage | undefined
  const next = (): SiriEtMessage | undefined => {
    while (from < bytes.length) {
      const end = bytes.indexOf(10, from)
      const line = bytes.toString('utf8', from, end < 0 ? bytes.length : end)
      from = end < 0 ? bytes.length : end + 1
      if (line.length > 0) return message(line)
    }
    return undefined
  }
  return (now) => {
    const due: SiriEtMessage[] = []
    for (pending ??= next(); pending && pending.receivedAt <= now; pending = next()) {
      due.push(pending)
    }
    return due
  }
}

/** One line of a recording as its message. */
function message(line: string): SiriEtMessage {
  const { dataset, receivedAt, body } = JSON.parse(line) as Record<string, string>
  return { dataset, receivedAt: Date.parse(receivedAt), body }
}

/**
 * The stops and platforms of a timetable folder inside a box, the timetable's own unless another
 * is given.
 */
export async function readBox(timetableDir: string, area?: Box): Promise<ReaderBox> {
  const read = async (name: string): Promise<unknown> =>
    JSON.parse(await readFile(/* turbopackIgnore: true */ join(timetableDir, name), 'utf8'))
  const manifest = await read('manifest.json')
  return boxOf(manifest, await read(stopsFileOf(manifest)), area)
}
