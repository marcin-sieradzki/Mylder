// What Rejseplanen API 2.0 answers to the four services Mylder calls, as Effect schemas. The live
// client, the recordings and the simulation all decode or encode with these, so the tracker reads
// one shape whichever source answered.
//
// Written from HaCon's HAFAS ReST specification and the saved Rejseplanen answers the API research
// read (docs/researches/2026-10-25-rejseplanen-api-2.md on branch research/rejseplanen-api-2). A
// field no saved answer showed is optional. The first day with the key corrects the rest: until
// then every shape here is a best reading, and the error shapes are guesses.
//
// Times and dates stay as Rejseplanen writes them, `HH:MM:SS` and `YYYY-MM-DD` in Danish time;
// the client turns them into moments. Unknown fields are dropped when decoding.
import 'server-only'
import { Schema } from 'effect'

const optional = Schema.optionalKey

/** A journey's reference, which `journeyDetail` takes as its `id`. */
export const JourneyDetailRef = Schema.Struct({ ref: Schema.String })

/**
 * A trip's product: its line, category and train number. `cls` is the product class in the
 * request's bitmask (16 for S-tog, 1024 for Metro), written as a string; `num` is the train or
 * journey number.
 */
export const Product = Schema.Struct({
  name: optional(Schema.String),
  internalName: optional(Schema.String),
  displayNumber: optional(Schema.String),
  num: optional(Schema.String),
  line: optional(Schema.String),
  lineId: optional(Schema.String),
  catOut: optional(Schema.String),
  catIn: optional(Schema.String),
  catCode: optional(Schema.String),
  cls: optional(Schema.String),
  operatorCode: optional(Schema.String),
  operator: optional(Schema.String),
  admin: optional(Schema.String),
})

export interface Note {
  readonly value: string
  readonly key?: string
  readonly type?: string
  readonly priority?: number
  readonly routeIdxFrom?: number
  readonly routeIdxTo?: number
  readonly txtN?: string
  /** Notes inside this one, which the 2026-11-25 change allows. */
  readonly Note?: readonly Note[]
}

/** A remark on a trip or a stop. Since the 2026-11-25 change a note may hold notes. */
export const Note: Schema.Codec<Note> = Schema.Struct({
  value: Schema.String,
  key: optional(Schema.String),
  type: optional(Schema.String),
  priority: optional(Schema.Number),
  routeIdxFrom: optional(Schema.Number),
  routeIdxTo: optional(Schema.Number),
  txtN: optional(Schema.String),
  Note: optional(Schema.Array(Schema.suspend((): Schema.Codec<Note> => Note))),
})

export const Notes = Schema.Struct({ Note: Schema.Array(Note) })

/**
 * How a realtime time came about. Rejseplanen's answers showed `PROGNOSED` and `CALCULATED`; the
 * specification lists the rest. A time with no prognosis type has no realtime at all.
 */
export const PrognosisType = Schema.Literals([
  'PROGNOSED',
  'CALCULATED',
  'MANUAL',
  'REPORTED',
  'CORRECTED',
])

/** A platform as the realtime fields give it. Its shape is the specification's, unconfirmed. */
export const Platform = Schema.Struct({ type: optional(Schema.String), text: Schema.String })

/** A stop as messages name it. `extId` is the GTFS stop id without its leading zeros. */
export const StopLocation = Schema.Struct({
  name: Schema.String,
  id: optional(Schema.String),
  extId: Schema.String,
  lon: Schema.Number,
  lat: Schema.Number,
})

/** One call of a journey: its planned times, and the realtime ones where there are any. */
export const Stop = Schema.Struct({
  name: Schema.String,
  id: optional(Schema.String),
  extId: Schema.String,
  routeIdx: optional(Schema.Number),
  lon: Schema.Number,
  lat: Schema.Number,
  arrTime: optional(Schema.String),
  arrDate: optional(Schema.String),
  depTime: optional(Schema.String),
  depDate: optional(Schema.String),
  rtArrTime: optional(Schema.String),
  rtArrDate: optional(Schema.String),
  rtDepTime: optional(Schema.String),
  rtDepDate: optional(Schema.String),
  arrPrognosisType: optional(PrognosisType),
  depPrognosisType: optional(PrognosisType),
  arrTrack: optional(Schema.String),
  depTrack: optional(Schema.String),
  rtArrTrack: optional(Schema.String),
  rtDepTrack: optional(Schema.String),
  rtArrPlatform: optional(Platform),
  rtDepPlatform: optional(Platform),
  cancelledArrival: optional(Schema.Boolean),
  cancelledDeparture: optional(Schema.Boolean),
  additional: optional(Schema.Boolean),
})

export const Stops = Schema.Struct({ Stop: Schema.Array(Stop) })

/** A disruption message, from `himsearch` or embedded in a journey. */
export interface Message {
  readonly id: string
  readonly act?: boolean
  readonly head: string
  readonly lead?: string
  readonly text?: string
  readonly company?: string
  readonly category?: string
  readonly priority?: number
  /** The product classes it concerns, as the request's bitmask. */
  readonly products?: number
  readonly sDate?: string
  readonly sTime?: string
  readonly eDate?: string
  readonly eTime?: string
  readonly affectedStops?: { readonly StopLocation: readonly (typeof StopLocation.Type)[] }
  readonly validFromStop?: typeof StopLocation.Type
  readonly validToStop?: typeof StopLocation.Type
  /** In a journey's own messages: the first and last of its calls the message covers. */
  readonly routeIdxFrom?: number
  readonly routeIdxTo?: number
  readonly Note?: readonly Note[]
  /** Child messages, in the hierarchical view. */
  readonly Message?: readonly Message[]
}

export const Message: Schema.Codec<Message> = Schema.Struct({
  id: Schema.String,
  act: optional(Schema.Boolean),
  head: Schema.String,
  lead: optional(Schema.String),
  text: optional(Schema.String),
  company: optional(Schema.String),
  category: optional(Schema.String),
  priority: optional(Schema.Number),
  products: optional(Schema.Number),
  sDate: optional(Schema.String),
  sTime: optional(Schema.String),
  eDate: optional(Schema.String),
  eTime: optional(Schema.String),
  affectedStops: optional(Schema.Struct({ StopLocation: Schema.Array(StopLocation) })),
  validFromStop: optional(StopLocation),
  validToStop: optional(StopLocation),
  routeIdxFrom: optional(Schema.Number),
  routeIdxTo: optional(Schema.Number),
  Note: optional(Schema.Array(Note)),
  Message: optional(Schema.Array(Schema.suspend((): Schema.Codec<Message> => Message))),
})

export const Messages = Schema.Struct({ Message: Schema.Array(Message) })

/** Every answer's envelope. `planRtTs` is when Rejseplanen last updated its realtime. */
const envelope = {
  serverVersion: optional(Schema.String),
  dialectVersion: optional(Schema.String),
  planRtTs: optional(Schema.String),
  requestId: optional(Schema.String),
}

/**
 * One step of a journey's progress between two stops. Only the specification describes it, so
 * every field is optional.
 */
export const JourneyPathItem = Schema.Struct({
  progressInTime: optional(Schema.Number),
  progressInPercent: optional(Schema.Number),
  dirGeo: optional(Schema.Number),
  state: optional(Schema.String),
  fromLocationId: optional(Schema.String),
  toLocationId: optional(Schema.String),
})

/**
 * One journey in a `journeyPos` answer, at a position. No position carries a time or says
 * whether a vehicle reported it: the request's `positionMode` decides that. Whether a journey
 * carries its stops or its path is unknown until the first day.
 */
export const PositionJourney = Schema.Struct({
  JourneyDetailRef,
  lat: Schema.Number,
  lon: Schema.Number,
  name: optional(Schema.String),
  direction: optional(Schema.String),
  trainNumber: optional(Schema.String),
  trainCategory: optional(Schema.String),
  Product: optional(Schema.Array(Product)),
  JourneyOrigin: optional(StopLocation),
  JourneyDestination: optional(StopLocation),
  Stops: optional(Stops),
  JourneyPath: optional(Schema.Array(JourneyPathItem)),
  Notes: optional(Notes),
  Messages: optional(Messages),
})

/** The `journeyPos` answer: every journey in the box, up to `maxJny`. No journeys, no list. */
export const JourneyPosAnswer = Schema.Struct({
  Journey: optional(Schema.Array(PositionJourney)),
  ...envelope,
})

/** `JourneyStatus`: P planned, R replacement, A additional (an extra trip), S special. */
export const JourneyStatus = Schema.Literals(['P', 'R', 'A', 'S'])

/** One departure from a stop's platform. A cancelled one has no prognosis. */
export const Departure = Schema.Struct({
  JourneyDetailRef,
  name: Schema.String,
  type: optional(Schema.String),
  stop: Schema.String,
  stopid: optional(Schema.String),
  stopExtId: Schema.String,
  lon: optional(Schema.Number),
  lat: optional(Schema.Number),
  time: Schema.String,
  date: Schema.String,
  rtTime: optional(Schema.String),
  rtDate: optional(Schema.String),
  track: optional(Schema.String),
  rtTrack: optional(Schema.String),
  rtPlatform: optional(Platform),
  prognosisType: optional(PrognosisType),
  direction: optional(Schema.String),
  reachable: optional(Schema.Boolean),
  cancelled: optional(Schema.Boolean),
  partCancelled: optional(Schema.Boolean),
  JourneyStatus: optional(JourneyStatus),
  ProductAtStop: optional(Product),
  Product: optional(Schema.Array(Product)),
  Notes: optional(Notes),
  Messages: optional(Messages),
})

/** The `multiDepartureBoard` answer: departures from every stop in `idList`. */
export const DepartureBoardAnswer = Schema.Struct({
  Departure: optional(Schema.Array(Departure)),
  ...envelope,
})

/**
 * The `journeyDetail` answer: one journey's calls, its last position (no time, no flag) and its
 * own messages with the calls they cover.
 */
export const JourneyDetailAnswer = Schema.Struct({
  Stops,
  ref: optional(Schema.String),
  dayOfOperation: optional(Schema.String),
  lastPos: optional(Schema.Struct({ lat: Schema.Number, lon: Schema.Number })),
  Product: optional(Schema.Array(Product)),
  Notes: optional(Notes),
  Messages: optional(Messages),
  JourneyStatus: optional(JourneyStatus),
  reachable: optional(Schema.Boolean),
  cancelled: optional(Schema.Boolean),
  partCancelled: optional(Schema.Boolean),
  ...envelope,
})

/** The `himsearch` answer: the disruption messages, at most 100. */
export const HimSearchAnswer = Schema.Struct({
  Message: optional(Schema.Array(Message)),
  ...envelope,
})

/**
 * An error answer. A refused key's `API_AUTH` is reported by a client; `API_QUOTA` for a spent
 * month is a guess. Both shapes are best guesses until the first real error answers, and so is
 * the HTTP status they come with.
 */
export const ErrorAnswer = Schema.Struct({
  errorCode: Schema.String,
  errorText: optional(Schema.String),
})

/** The error code a refused key gets. Reported, not confirmed. */
export const REFUSED_KEY = 'API_AUTH'

/** The error code a spent month gets. A guess. */
export const QUOTA_SPENT = 'API_QUOTA'

/** The services Mylder calls, by the last segment of their URL path. */
export const SERVICES = ['journeyPos', 'multiDepartureBoard', 'journeyDetail', 'himsearch'] as const

export type Service = (typeof SERVICES)[number]

/** The service a request's URL calls, from the last segment of its path, in any case. */
export function serviceOf(url: URL): Service | undefined {
  const last = url.pathname.split('/').at(-1)?.toLowerCase()
  return SERVICES.find((service) => service.toLowerCase() === last)
}

/** Each service's answer schema. */
export const ANSWERS = {
  journeyPos: JourneyPosAnswer,
  multiDepartureBoard: DepartureBoardAnswer,
  journeyDetail: JourneyDetailAnswer,
  himsearch: HimSearchAnswer,
} as const satisfies Record<Service, Schema.Top>

export type JourneyPosAnswer = typeof JourneyPosAnswer.Type
export type PositionJourney = typeof PositionJourney.Type
export type DepartureBoardAnswer = typeof DepartureBoardAnswer.Type
export type Departure = typeof Departure.Type
export type JourneyDetailAnswer = typeof JourneyDetailAnswer.Type
export type HimSearchAnswer = typeof HimSearchAnswer.Type
export type ErrorAnswer = typeof ErrorAnswer.Type
export type Stop = typeof Stop.Type
export type Product = typeof Product.Type
export type StopLocation = typeof StopLocation.Type
