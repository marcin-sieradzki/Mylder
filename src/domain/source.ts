// What a rider is told about the source the page runs on (docs/testing-seams.md, "The switch"):
// whether it asks Rejseplanen, whether it has positions, whether it brings disruption messages,
// and how it is named and credited. The tracker, the domain's rules and the screens read this
// description, never the kind itself, so a new source changes this one place.

/** Every source the snapshot can name, in the order the switch gives them. */
export const SOURCE_KINDS = ['timetable', 'simulated', 'recording', 'rejseplanen'] as const

export type SourceKind = (typeof SOURCE_KINDS)[number]

/** How the page names a source, in its banner and the About dialog's status. */
export type SourceName = SourceKind

export interface SourceDescription {
  /**
   * Whether the tracker asks Rejseplanen, or the simulation or recording that answers in its
   * place: with no call, nothing can stop answering, so nothing pauses and no data card shows.
   */
  readonly callsRejseplanen: boolean
  /**
   * Whether vehicles can be placed from positions; without them every vehicle is placed from its
   * timetable by design, so the screens say live positions aren't connected yet.
   */
  readonly positions: boolean
  /** Whether it brings Rejseplanen's disruption messages; without them Disruptions says so. */
  readonly messages: boolean
  /** How it is named. */
  readonly name: SourceName
  /**
   * Whose data the transit is credited to: Rejseplanen's realtime and timetable, or the timetable
   * alone.
   */
  readonly credit: 'rejseplanen' | 'timetable'
}

/** Rejseplanen's answers, real, simulated or recorded. */
const answering = (name: SourceName): SourceDescription => ({
  callsRejseplanen: true,
  positions: true,
  messages: true,
  name,
  credit: 'rejseplanen',
})

/** The description of a source; a kind with no case here fails typecheck. */
export function describeSource(kind: SourceKind): SourceDescription {
  switch (kind) {
    case 'timetable':
      return {
        callsRejseplanen: false,
        positions: false,
        messages: false,
        name: 'timetable',
        credit: 'timetable',
      }
    case 'simulated':
    case 'recording':
    case 'rejseplanen':
      return answering(kind)
    default:
      return undescribed(kind)
  }
}

/** Reached only by a kind the switch has no case for, which typecheck refuses first. */
function undescribed(kind: never): never {
  throw new Error(`The source "${String(kind)}" has no description`)
}
