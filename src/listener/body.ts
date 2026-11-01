// A message's body as the broker delivers it (#217), turned into what the reader takes: unzipped
// when it is gzip, and never held past the reader's size limit, so the listener's memory stays
// bounded by the reader's caps however far one message would expand.
import { gunzipSync } from 'node:zlib'
import type { SiriEtMessage, SkippedMessage } from '../siri-et/reader.ts'

/**
 * The message whose body is `bytes`, or, when the body is over `maxBytes` as it came or once
 * unzipped, the message skipped as too large. A broken gzip gives an empty body, which the reader
 * counts as malformed. Bytes, not characters, are counted, so a body is skipped no later than the
 * reader's own limit on characters would skip it.
 */
export function deliveredMessage(
  dataset: string,
  receivedAt: number,
  bytes: Buffer,
  maxBytes: number,
): SiriEtMessage | SkippedMessage {
  const skipped = { dataset, receivedAt, tooLarge: true as const }
  if (!isGzip(bytes)) {
    return bytes.byteLength > maxBytes ? skipped : { dataset, receivedAt, body: bytes.toString() }
  }
  try {
    return {
      dataset,
      receivedAt,
      body: gunzipSync(bytes, { maxOutputLength: maxBytes }).toString(),
    }
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ERR_BUFFER_TOO_LARGE') return skipped
    return { dataset, receivedAt, body: '' }
  }
}

const isGzip = (bytes: Buffer): boolean => bytes[0] === 0x1f && bytes[1] === 0x8b
