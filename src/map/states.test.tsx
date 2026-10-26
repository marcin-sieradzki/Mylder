import { act, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Snapshot } from '../tracker/index.ts'
import { snapshotStore, type SnapshotStore } from './live.ts'
import { dataStatesStore, statesAt, useDataStates, type DataStatesStore } from './states.ts'

const saved = (name: string): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', 'weekday', 'snapshots', name), 'utf8'),
  ) as Snapshot

// The sixth minute: reports every other poll of 60 s, so a report keeps a trip Live for 240 s.
const minute6 = saved('0006.json')
const A_LIVE = 's-tog.A.0bc307e3eb.20260616.0707'
const M1_TIMETABLE = 'metro.M1.7f21f99145.20260616.0703'
/** This device's clock runs 30 s behind the server's. */
const SLOW = 30_000
const serverAt = (seconds: number) => minute6.fetched + seconds * 1000

function States({ store }: { store: DataStatesStore }) {
  const states = useDataStates(store)
  return (
    <ul>
      <li>A: {states.get(A_LIVE) ?? 'not drawn'}</li>
      <li>M1: {states.get(M1_TIMETABLE) ?? 'not drawn'}</li>
    </ul>
  )
}

/** The page opened `seconds` after the snapshot's fetch, by the server's clock. */
function openAt(seconds: number): SnapshotStore {
  vi.setSystemTime(serverAt(seconds) - SLOW)
  const live = snapshotStore()
  live.update({ snapshot: minute6, clockOffset: SLOW })
  render(<States store={dataStatesStore(live)} />)
  return live
}

/** Moves the device's clock on to `seconds` after the fetch, by the server's clock. */
const waitUntil = (seconds: number) =>
  act(() => vi.advanceTimersByTime(serverAt(seconds) - SLOW - Date.now()))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("each vehicle's data state, by the clock", () => {
  it('agrees with the tracker at the moment each saved snapshot was fetched', () => {
    for (const recording of ['weekday', 'cap', 'empty', 'spent', 'refused-key']) {
      const dir = join(process.cwd(), 'recordings', recording, 'snapshots')
      for (const name of readdirSync(dir)) {
        const snapshot = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Snapshot
        const states = statesAt(snapshot, snapshot.fetched)
        for (const trip of snapshot.trips) {
          expect(`${recording}/${name} ${trip.key}: ${states.get(trip.key)}`).toBe(
            `${recording}/${name} ${trip.key}: ${trip.state}`,
          )
        }
      }
    }
  })

  it('turns a Live trip Ageing at the Live limit and No signal after 5 minutes, with no poll', () => {
    openAt(10)
    expect(screen.getByText('A: live')).toBeInTheDocument()
    waitUntil(239)
    expect(screen.getByText('A: live')).toBeInTheDocument()
    waitUntil(240)
    expect(screen.getByText('A: ageing')).toBeInTheDocument()
    waitUntil(299)
    expect(screen.getByText('A: ageing')).toBeInTheDocument()
    waitUntil(300)
    expect(screen.getByText('A: no-signal')).toBeInTheDocument()
    // A trip no answer has carried stays Timetable only however long the page waits.
    expect(screen.getByText('M1: timetable-only')).toBeInTheDocument()
  })

  it("ages from the server's clock, so a page opened late shows the state it has now", () => {
    openAt(250)
    expect(screen.getByText('A: ageing')).toBeInTheDocument()
  })

  it('starts again from each new snapshot', () => {
    const live = openAt(250)
    expect(screen.getByText('A: ageing')).toBeInTheDocument()
    // The eighth minute, fetched at 120 s, carries a fresh report of A; M1 has finished.
    act(() => live.update({ snapshot: saved('0008.json') }))
    expect(screen.getByText('A: live')).toBeInTheDocument()
    expect(screen.getByText('M1: not drawn')).toBeInTheDocument()
  })
})
