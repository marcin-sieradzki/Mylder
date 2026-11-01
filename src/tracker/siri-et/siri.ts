// Reads one SIRI-ET message body, as Dataudveksleren sends it (docs/live-data.md, "SIRI-ET"), into
// the journeys it carries: a single pass over its tags with no document built, tolerant of what
// it doesn't know. An element the reader doesn't use is skipped, a namespace prefix is ignored, and
// a value it can't read is left out. A body whose tags don't nest, or whose root isn't `Siri`, is
// malformed as a whole.
import 'server-only'

/** One call as a message carries it: a `RecordedCall` or an `EstimatedCall`. */
export interface SiriCall {
  stop?: string
  aimedArrival?: number
  aimedDeparture?: number
  expectedArrival?: number
  expectedDeparture?: number
  cancelled: boolean
}

/** One `EstimatedVehicleJourney`, with the parts the reader uses. */
export interface SiriJourney {
  /** `DataFrameRef`: the service day. */
  day?: string
  /** `DatedVehicleJourneyRef`. */
  journey?: string
  line?: string
  operator?: string
  origin?: string
  destination?: string
  trainNumber?: string
  cancelled: boolean
  calls: SiriCall[]
}

const TAG = /<(\/?)(?:[\w.-]+:)?([\w.-]+)[^>]*?(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>/g

const CALLS = new Set(['RecordedCall', 'EstimatedCall'])

/** The journeys a message body carries, or undefined when the body is malformed. */
export function readSiriEt(body: string): SiriJourney[] | undefined {
  const journeys: SiriJourney[] = []
  const open: string[] = []
  let journey: SiriJourney | undefined
  let call: SiriCall | undefined
  let textFrom = 0
  let sawRoot = false
  TAG.lastIndex = 0
  for (let match = TAG.exec(body); match; match = TAG.exec(body)) {
    const [, closing, name, selfClosing] = match
    if (name === undefined) {
      textFrom = TAG.lastIndex
      continue
    }
    if (closing) {
      if (open.pop() !== name) return undefined
      const parent = open[open.length - 1]
      if (name === 'EstimatedVehicleJourney' && journey) {
        journeys.push(journey)
        journey = undefined
      } else if (CALLS.has(name) && call && journey) {
        journey.calls.push(call)
        call = undefined
      } else if (journey) {
        const text = body.slice(textFrom, match.index)
        if (call && CALLS.has(parent)) readCall(call, name, text)
        else readJourney(journey, parent, name, text)
      }
    } else if (!selfClosing) {
      if (open.length === 0) {
        if (sawRoot || name !== 'Siri') return undefined
        sawRoot = true
      }
      open.push(name)
      if (name === 'EstimatedVehicleJourney') journey = { cancelled: false, calls: [] }
      else if (CALLS.has(name) && journey) call = { cancelled: false }
    }
    textFrom = TAG.lastIndex
  }
  if (!sawRoot || open.length > 0) return undefined
  return journeys
}

function readJourney(journey: SiriJourney, parent: string, name: string, raw: string) {
  const text = decoded(raw)
  if (parent === 'FramedVehicleJourneyRef') {
    if (name === 'DataFrameRef') journey.day = text
    else if (name === 'DatedVehicleJourneyRef') journey.journey = text
  } else if (parent === 'TrainNumbers') {
    if (name === 'TrainNumberRef') journey.trainNumber ??= text
  } else if (parent === 'EstimatedVehicleJourney') {
    if (name === 'LineRef') journey.line = text
    else if (name === 'OperatorRef') journey.operator = text
    else if (name === 'OriginRef') journey.origin = text
    else if (name === 'DestinationRef') journey.destination = text
    else if (name === 'Cancellation') journey.cancelled = text === 'true'
  }
}

function readCall(call: SiriCall, name: string, raw: string) {
  switch (name) {
    case 'StopPointRef':
      call.stop = decoded(raw)
      break
    case 'AimedArrivalTime':
      call.aimedArrival = moment(raw)
      break
    case 'AimedDepartureTime':
      call.aimedDeparture = moment(raw)
      break
    case 'ExpectedArrivalTime':
      call.expectedArrival = moment(raw)
      break
    case 'ExpectedDepartureTime':
      call.expectedDeparture = moment(raw)
      break
    case 'Cancellation':
      call.cancelled = raw.trim() === 'true'
      break
  }
}

/** A SIRI timestamp, local time with its offset, in milliseconds; undefined if unreadable. */
function moment(raw: string): number | undefined {
  const value = Date.parse(raw.trim())
  return Number.isNaN(value) ? undefined : value
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decoded(raw: string): string {
  const text = raw.trim()
  if (!text.includes('&')) return text
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole, entity: string) => {
    if (entity[0] !== '#') return ENTITIES[entity] ?? whole
    const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : +entity.slice(1)
    return String.fromCodePoint(code)
  })
}
