// What a rider is told about the source the page runs on (docs/testing-seams.md, "The switch"):
// whether it asks Rejseplanen, whether it has positions, whether it brings disruption messages,
// and the words that name and credit it, as keys into the dictionary. The tracker, the domain's
// rules and the screens read this description, never the kind itself, so a new source changes
// this one place.

/** Every source the snapshot can name. */
export const SOURCE_KINDS = ['timetable', 'simulated', 'recording', 'rejseplanen'] as const

export type SourceKind = (typeof SOURCE_KINDS)[number]

/** The source banner's words, which `{date}` fills with the day a recording was made. */
export type BannerWords = 'notices.simulated' | 'notices.recorded' | 'onTimetable.banner'

/** About's name for the source, which `{name}` fills with the scenario or the recording. */
export type SourceNameWords =
  | 'about.status.rejseplanen'
  | 'about.status.simulated'
  | 'about.status.recording'
  | 'onTimetable.source'

/** About's note on the vehicles when they aren't Rejseplanen's live data. */
export type SourceNoteWords = 'about.status.notReal' | 'onTimetable.note'

/** Every dictionary key a description names. */
export type SourceWords = BannerWords | SourceNameWords | SourceNoteWords

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
  /**
   * The banner that says where the page's data comes from, and whether it names the day the
   * snapshot was built; none for Rejseplanen's own live data.
   */
  readonly banner?: { readonly words: BannerWords; readonly dated: boolean }
  /** How About's status names the source. */
  readonly named: SourceNameWords
  /** What About notes of the vehicles; none when they are Rejseplanen's live data. */
  readonly note?: SourceNoteWords
  /**
   * Whose data the transit is credited to: Rejseplanen's realtime and timetable, or the timetable
   * alone.
   */
  readonly credit: 'rejseplanen' | 'timetable'
}

/** A description for each of the kinds `K`, every one required. */
export type SourceDescriptions<K extends string> = { readonly [Kind in K]: SourceDescription }

/** Rejseplanen's answers, real, simulated or recorded. */
const ANSWERING = {
  callsRejseplanen: true,
  positions: true,
  messages: true,
  credit: 'rejseplanen',
} as const

/**
 * Every source's description. Typed over `SOURCE_KINDS`, so a kind added there fails typecheck
 * here until it is described.
 */
export const SOURCE_DESCRIPTIONS: SourceDescriptions<SourceKind> = {
  timetable: {
    callsRejseplanen: false,
    positions: false,
    messages: false,
    banner: { words: 'onTimetable.banner', dated: false },
    named: 'onTimetable.source',
    note: 'onTimetable.note',
    credit: 'timetable',
  },
  simulated: {
    ...ANSWERING,
    banner: { words: 'notices.simulated', dated: false },
    named: 'about.status.simulated',
    note: 'about.status.notReal',
  },
  recording: {
    ...ANSWERING,
    banner: { words: 'notices.recorded', dated: true },
    named: 'about.status.recording',
    note: 'about.status.notReal',
  },
  rejseplanen: { ...ANSWERING, named: 'about.status.rejseplanen' },
}

/** The description of a source. */
export const describeSource = (kind: SourceKind): SourceDescription => SOURCE_DESCRIPTIONS[kind]
