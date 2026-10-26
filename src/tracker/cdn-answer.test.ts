import { afterEach, describe, expect, it, vi } from 'vitest'
import { cdnAnswer, unavailable } from './cdn-answer.ts'

// The route answers' core, fed by a plain producer rather than the tracker: what it answers for a
// value, for none, and for a producer that fails.
const now = Date.UTC(2026, 5, 16, 5, 20, 30)
const policy = { whileRevalidating: 10, ifError: 60, retryAfter: 10 }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cdnAnswer', () => {
  it('answers a value, held by the CDN until it is due and dated the moment it was read', async () => {
    const value = { nextDue: now + 20_000, planes: 3 }
    const response = await cdnAnswer('aircraft', async () => ({ value, now }), policy)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(value)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe(
      'max-age=20, stale-while-revalidate=10, stale-if-error=60',
    )
    expect(response.headers.get('Date')).toBe('Tue, 16 Jun 2026 05:20:30 GMT')
  })

  it('answers 404, kept by no one, when there is no value', async () => {
    const response = await cdnAnswer('aircraft', async () => ({ value: undefined, now }), policy)
    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'unknown aircraft' })
  })

  it('answers 503, to be asked again when the policy says, and logs what failed', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const offline = new Error('offline')
    const response = await cdnAnswer('aircraft', () => Promise.reject(offline), policy)
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('10')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(log).toHaveBeenCalledWith('Could not answer the aircraft', offline)
  })
})

describe('unavailable', () => {
  it('answers 503, to be asked again in 30 s when no policy says otherwise', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = unavailable(new Error('unreadable'), 'timetable manifest')
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('30')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
