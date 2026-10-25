import { describe, expect, it } from 'vitest'
import { cacheHeaders } from './caching'

const now = Date.UTC(2026, 5, 16, 5, 20, 30)

describe('cacheHeaders', () => {
  it.each([
    [60_000, 60],
    [41_200, 42],
    [3_000, 5],
    [-10_000, 5],
  ])(
    'keeps an answer due in %i ms at the CDN for %i s, and nothing in the browser',
    (dueIn, seconds) => {
      expect(cacheHeaders(now + dueIn, now)).toEqual({
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Vercel-CDN-Cache-Control': `max-age=${seconds}, stale-while-revalidate=30, stale-if-error=300`,
      })
    },
  )
})
