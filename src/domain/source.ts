// What a rider is told about the source the page runs on (docs/testing-seams.md, "The switch"):
// whether it asks Rejseplanen, whether it has positions, whether it brings disruption messages,
// and the words that name and credit it, as keys into the dictionary, with SIRI-ET's delays on
// (`MYLDER_UPDATES`, spec #146) or off. The domain's rules, the
// screens and the tracker's run read this description, never the kind itself: only
// src/tracker/source.ts tells its sources apart, to build each one. A new source changes this one
// place. Beside it, `NOT_IN_SIRI_ET`: the modes SIRI-ET's delays never reach, whatever the source,
// which the tracker's join leaves alone and City pulse's shares with an update read as "—".

/** Every source the snapshot can name. */
export const SOURCE_KINDS = ['timetable', 'simulated', 'recording', 'rejseplanen'] as const

export type SourceKind = (typeof SOURCE_KINDS)[number]

/** The source banner's words, which `{date}` fills with the day a recording was made. */
export type BannerWords =
  'notices.simulated' | 'notices.recorded' | 'onTimetable.banner' | 'onTimetable.bannerWithDelays'

/** The legend's note on which states the dots can take, on a source with no positions. */
export type LegendWords = 'onTimetable.legend' | 'onTimetable.legendWithDelays'

/** About's name for the source, which `{name}` fills with the scenario or the recording. */
export type SourceNameWords =
  | 'about.status.rejseplanen'
  | 'about.status.simulated'
  | 'about.status.recording'
  | 'onTimetable.source'

/** About's note on the vehicles when they aren't Rejseplanen's live data. */
export type SourceNoteWords = 'about.status.notReal' | 'onTimetable.note'

/** Every dictionary key a description names. */
export type SourceWords = BannerWords | LegendWords | SourceNameWords | SourceNoteWords

export interface SourceDescription {
  /**
   * Whether the tracker asks Rejseplanen, or the simulation or recording that answers in its
   * place: with no call, nothing can stop answering, so nothing pauses and no data card about
   * Rejseplanen's answers shows; a quiet SIRI-ET feed's card still can (./data-cards.ts).
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
  /**
   * The legend's note on which states the dots can take, where a source rules some out: without
   * positions, nothing is Live or Ageing.
   */
  readonly legend?: LegendWords
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

/** What SIRI-ET's delays change in a source's description, when they are on. */
export type WithDelays = Partial<Pick<SourceDescription, 'banner' | 'legend'>>

/** A description for each of the kinds `K`, every one required, and what delays change in it. */
export type SourceDescriptions<K extends string> = {
  readonly [Kind in K]: SourceDescription & { readonly withDelays?: WithDelays }
}

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
    legend: 'onTimetable.legend',
    named: 'onTimetable.source',
    note: 'onTimetable.note',
    credit: 'timetable',
    // Vehicles are placed from the timetable and, where Rejseplanen has sent one, their delay.
    withDelays: {
      banner: { words: 'onTimetable.bannerWithDelays', dated: false },
      legend: 'onTimetable.legendWithDelays',
    },
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

/**
 * The description of a source, with SIRI-ET's delays on (`delays`, the snapshot's updates not off)
 * or off. A source whose banner and legend are its own whatever the delays, such as a simulation,
 * reads the same either way.
 */
export function describeSource(
  kind: SourceKind,
  { delays = false }: { readonly delays?: boolean } = {},
): SourceDescription {
  const { withDelays, ...description } = SOURCE_DESCRIPTIONS[kind]
  return delays ? { ...description, ...withDelays } : description
}

/**
 * The modes SIRI-ET carries no journeys of (ADR 0019): no dataset covers the Metro or the light
 * rail, so their trips are never joined to an update and their share of delays is unknown, not 0.
 */
export const NOT_IN_SIRI_ET: ReadonlySet<string> = new Set(['metro', 'light-rail'])
