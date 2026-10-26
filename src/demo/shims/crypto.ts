// Node's `createHash`, as far as the disruption list's fingerprint uses it. The fingerprint only
// has to change whenever the messages do, so the worker gets a 64-bit FNV-1a, not a SHA-256:
// fingerprints differ from the server's, which nothing compares them with.
const OFFSET = 0xcbf29ce484222325n
const PRIME = 0x100000001b3n
const MASK = (1n << 64n) - 1n

export function createHash(_algorithm: string) {
  let hash = OFFSET
  const hasher = {
    update(data: string) {
      for (const byte of new TextEncoder().encode(data)) {
        hash = ((hash ^ BigInt(byte)) * PRIME) & MASK
      }
      return hasher
    },
    digest: (_encoding: 'hex') => hash.toString(16).padStart(16, '0'),
  }
  return hasher
}
