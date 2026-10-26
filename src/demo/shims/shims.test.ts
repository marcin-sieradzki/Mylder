import { describe, expect, it } from 'vitest'
import { createHash } from './crypto.ts'
import { join } from './path.ts'

describe("the worker's stand-ins for Node", () => {
  it('join path segments with one slash between them', () => {
    expect(join('/', 'public', 'timetable')).toBe('/public/timetable')
    expect(join('timetable/', '/manifest.json')).toBe('timetable/manifest.json')
  })

  it('fingerprint the same text the same way, and other text otherwise', () => {
    const of = (text: string) => createHash('sha256').update(text).digest('hex')
    expect(of('[{"id":"1"}]')).toBe(of('[{"id":"1"}]'))
    expect(of('[{"id":"1"}]')).not.toBe(of('[{"id":"2"}]'))
    expect(of('')).toMatch(/^[0-9a-f]{16}$/)
  })
})
