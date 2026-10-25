// The simulation's only source of chance: a hash of the seed and a few labels, so the same
// scenario, seed and moment always give the same answer, on any instance and in any order.
import 'server-only'

/** A 32-bit FNV-1a hash of the parts, joined. */
export function hash(...parts: readonly (string | number)[]): number {
  let h = 0x811c9dc5
  const text = parts.join('|')
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // A final mix, since FNV-1a's low bits vary little between near-identical labels.
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  return h >>> 0
}

/** A number in [0, 1) from the parts. */
export function chance(...parts: readonly (string | number)[]): number {
  return hash(...parts) / 2 ** 32
}
