import { describe, expect, it } from 'vitest'
import { describeSource, SOURCE_KINDS, type SourceDescription, type SourceKind } from './source'

describe('what a rider is told about each source', () => {
  it.each([
    [
      'timetable',
      {
        callsRejseplanen: false,
        positions: false,
        messages: false,
        name: 'timetable',
        credit: 'timetable',
      },
    ],
    [
      'simulated',
      {
        callsRejseplanen: true,
        positions: true,
        messages: true,
        name: 'simulated',
        credit: 'rejseplanen',
      },
    ],
    [
      'recording',
      {
        callsRejseplanen: true,
        positions: true,
        messages: true,
        name: 'recording',
        credit: 'rejseplanen',
      },
    ],
    [
      'rejseplanen',
      {
        callsRejseplanen: true,
        positions: true,
        messages: true,
        name: 'rejseplanen',
        credit: 'rejseplanen',
      },
    ],
  ] satisfies [SourceKind, SourceDescription][])('the %s source', (kind, description) => {
    expect(describeSource(kind)).toEqual(description)
  })

  it('describes every kind the snapshot can name', () => {
    expect(SOURCE_KINDS).toEqual(['timetable', 'simulated', 'recording', 'rejseplanen'])
    for (const kind of SOURCE_KINDS) expect(describeSource(kind).name).toBe(kind)
  })

  // The type test: the snapshot's kinds are `SOURCE_KINDS`, and the description is an exhaustive
  // switch over them, so a kind added there fails `npm run typecheck` at the switch until it has a
  // case. A kind outside them is refused, by the type and, should one get past it, at run time.
  it('takes no kind it has not described', () => {
    // @ts-expect-error -- a SIRI-ET source, say, has no description until the switch gives it one
    expect(() => describeSource('siri-et')).toThrow('siri-et')
  })
})
