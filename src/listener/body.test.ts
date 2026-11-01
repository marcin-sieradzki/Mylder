// A message's body as the broker delivers it, turned into what the reader takes (#217): unzipped
// when it is gzip, and never past the reader's size limit, so one message can't fill the machine.
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSiriEtMessages } from '../siri-et/recording'
import { deliveredMessage } from './body'

const [message] = await readSiriEtMessages(
  join(process.cwd(), 'src', 'siri-et', 'fixtures', 'sample.jsonl.gz'),
)
const bytes = Buffer.from(message.body)
const LIMIT = bytes.byteLength

describe('a delivered message’s body', () => {
  it('is read as it came, or unzipped when it is gzip', () => {
    for (const delivered of [bytes, gzipSync(bytes)]) {
      expect(deliveredMessage('788', 1, delivered, LIMIT)).toEqual({
        dataset: '788',
        receivedAt: 1,
        body: message.body,
      })
    }
  })

  it('is skipped as too large past the limit, gzip or not, and never unzipped past it', () => {
    const bomb = gzipSync(Buffer.alloc(64 * 1024 * 1024))
    expect(bomb.byteLength).toBeLessThan(100_000)
    for (const delivered of [Buffer.concat([bytes, Buffer.from(' ')]), bomb]) {
      expect(deliveredMessage('788', 1, delivered, LIMIT)).toEqual({
        dataset: '788',
        receivedAt: 1,
        tooLarge: true,
      })
    }
  })

  it('is empty, for the reader to count as malformed, when its gzip is broken', () => {
    const broken = gzipSync(bytes).subarray(0, 100)
    expect(deliveredMessage('788', 1, broken, LIMIT)).toEqual({
      dataset: '788',
      receivedAt: 1,
      body: '',
    })
  })
})
