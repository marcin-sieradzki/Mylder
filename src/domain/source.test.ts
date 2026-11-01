import { describe, expect, it } from 'vitest'
import {
  describeSource,
  SOURCE_DESCRIPTIONS,
  SOURCE_KINDS,
  type SourceDescription,
  type SourceDescriptions,
  type SourceKind,
} from './source'

describe('what a rider is told about each source', () => {
  it.each([
    [
      'timetable',
      {
        callsRejseplanen: false,
        positions: false,
        messages: false,
        banner: { words: 'onTimetable.banner', dated: false },
        named: 'onTimetable.source',
        note: 'onTimetable.note',
        credit: 'timetable',
      },
    ],
    [
      'simulated',
      {
        callsRejseplanen: true,
        positions: true,
        messages: true,
        banner: { words: 'notices.simulated', dated: false },
        named: 'about.status.simulated',
        note: 'about.status.notReal',
        credit: 'rejseplanen',
      },
    ],
    [
      'recording',
      {
        callsRejseplanen: true,
        positions: true,
        messages: true,
        banner: { words: 'notices.recorded', dated: true },
        named: 'about.status.recording',
        note: 'about.status.notReal',
        credit: 'rejseplanen',
      },
    ],
    [
      'rejseplanen',
      {
        callsRejseplanen: true,
        positions: true,
        messages: true,
        named: 'about.status.rejseplanen',
        credit: 'rejseplanen',
      },
    ],
  ] satisfies [SourceKind, SourceDescription][])('the %s source', (kind, description) => {
    expect(describeSource(kind)).toEqual(description)
  })

  it('describes every kind the snapshot can name', () => {
    expect(SOURCE_KINDS).toEqual(['timetable', 'simulated', 'recording', 'rejseplanen'])
    expect(Object.keys(SOURCE_DESCRIPTIONS).sort()).toEqual([...SOURCE_KINDS].sort())
  })

  // The type test, checked by `npm run typecheck`: the snapshot's kinds are `SOURCE_KINDS`, and
  // the descriptions are typed over them, so a kind added there with no description fails.
  it('fails typecheck for a kind added with no description', () => {
    const described: SourceDescriptions<SourceKind> = SOURCE_DESCRIPTIONS
    // @ts-expect-error -- were `SOURCE_KINDS` to gain 'siri-et', its description would be missing
    const withSiriEt: SourceDescriptions<SourceKind | 'siri-et'> = SOURCE_DESCRIPTIONS
    expect(withSiriEt).toBe(described)
  })

  it('takes no kind outside them', () => {
    // @ts-expect-error -- 'siri-et' is no kind the snapshot can name
    expect(describeSource('siri-et')).toBeUndefined()
  })
})
