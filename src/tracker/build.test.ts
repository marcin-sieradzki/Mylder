import { describe, expect, it } from 'vitest'
import { lastSeenByMode } from './build'
import type { SnapshotTrip } from './snapshot'

const trip = (mode: SnapshotTrip['mode'], seen?: number) => ({ mode, seen }) as SnapshotTrip

describe('when each mode was last seen', () => {
  // 00:20 in Copenhagen on Tuesday 2026-06-16; Monday's service day, from 00:00, still runs.
  const now = Date.UTC(2026, 5, 15, 22, 20)
  const monday = Date.UTC(2026, 5, 14, 22)
  const lastBus = Date.UTC(2026, 5, 15, 21, 50)

  it('keeps a mode’s time past midnight after its trips have gone', () => {
    expect(lastSeenByMode([trip('s-tog', now)], { bus: lastBus }, monday)).toEqual({
      bus: lastBus,
      's-tog': now,
    })
  })

  it('takes the latest of the record and the trips', () => {
    expect(lastSeenByMode([trip('bus', now), trip('bus')], { bus: lastBus }, monday)).toEqual({
      bus: now,
    })
  })

  it('drops moments before the earliest service day still running', () => {
    expect(lastSeenByMode([], { bus: monday - 1, 's-tog': monday }, monday)).toEqual({
      's-tog': monday,
    })
  })
})
