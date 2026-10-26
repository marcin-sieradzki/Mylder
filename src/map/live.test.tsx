import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../tracker/index.ts'
import { snapshotStore, useLiveSnapshot, useSnapshot, type SnapshotStore } from './live.ts'

const saved = (name: string): Snapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'recordings', 'weekday', 'snapshots', name), 'utf8'),
  ) as Snapshot

function Trips({ store }: { store: SnapshotStore }) {
  const { snapshot } = useLiveSnapshot(store)
  return <p>{snapshot ? `${snapshot.trips.length} trips` : 'Nothing yet'}</p>
}

describe('the live snapshot', () => {
  it('renders a component again when a new snapshot lands', () => {
    const store = snapshotStore()
    render(<Trips store={store} />)
    expect(screen.getByText('Nothing yet')).toBeInTheDocument()
    act(() => store.update({ snapshot: saved('0001.json') }))
    expect(screen.getByText('17 trips')).toBeInTheDocument()
    act(() => store.update({ snapshot: saved('0007.json') }))
    expect(screen.getByText('16 trips')).toBeInTheDocument()
  })

  it("renders a component that reads the snapshot only when one lands, not on each poll's news", () => {
    const store = snapshotStore()
    let renders = 0
    function Count() {
      renders++
      const snapshot = useSnapshot(store)
      return <p>{snapshot ? `${snapshot.trips.length} trips` : 'Nothing yet'}</p>
    }
    render(<Count />)
    act(() => store.update({ snapshot: saved('0001.json'), lastGoodPoll: 1 }))
    expect(renders).toBe(2)
    act(() => store.update({ failingSince: 2 }))
    act(() => store.update({ clockOffset: 30_000 }))
    expect(renders).toBe(2)
  })
})
