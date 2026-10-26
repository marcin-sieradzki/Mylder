import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  addressView,
  searchWith,
  useAircraftHidden,
  useHiddenModes,
  usePanel,
  viewOf,
} from './view.ts'

describe("the view an address's query names", () => {
  it('reads the zoom, latitude and longitude a map link gives', () => {
    expect(viewOf('?map=12.50/55.67610/12.56830')).toMatchObject({
      centre: [12.5683, 55.6761],
      zoom: 12.5,
    })
  })

  it.each([
    ['a latitude past the pole', '?map=11.20/95.00000/12.56500'],
    ['a longitude past the date line', '?map=11.20/55.68000/192.56500'],
    ['a zoom below the whole world', '?map=-3/55.68000/12.56500'],
    ['a zoom past the closest the map draws', '?map=40/55.68000/12.56500'],
  ])('leaves the place at its default for %s', (_, search) => {
    const view = viewOf(search)
    expect(view.centre).toBeUndefined()
    expect(view.zoom).toBeUndefined()
  })
})

describe('the filters in the address', () => {
  it('reads the aircraft beside the modes, and leaves them out of the modes hidden', () => {
    const view = viewOf('?hide=bus,aircraft,boats')
    expect([...view.hidden]).toEqual(['bus'])
    expect(view.aircraftHidden).toBe(true)
    expect(viewOf('?hide=bus').aircraftHidden).toBeFalsy()
  })

  it('writes the aircraft after the modes, and keeps every other parameter', () => {
    expect(
      searchWith('?line=5C', { hidden: new Set(['metro', 'bus']), aircraftHidden: true }),
    ).toBe('?line=5C&hide=bus,metro,aircraft')
    expect(searchWith('?hide=aircraft', { hidden: new Set(), aircraftHidden: false })).toBe('')
  })
})

describe('the open panel in the address', () => {
  it('reads an open stop and an open trip', () => {
    expect(viewOf('?stop=8600626').panel).toEqual({ kind: 'stop', id: '8600626' })
    expect(viewOf('?trip=bus.5C.32331e0e20.20260616.0707').panel).toEqual({
      kind: 'trip',
      id: 'bus.5C.32331e0e20.20260616.0707',
    })
    expect(viewOf('?hide=bus').panel).toBeUndefined()
  })

  it('writes one panel at a time, and keeps every other parameter', () => {
    const trip = { kind: 'trip', id: 'bus.5C.32331e0e20.20260616.0707' } as const
    expect(searchWith('?line=5C&stop=8600626', { hidden: new Set(), panel: trip })).toBe(
      '?line=5C&trip=bus.5C.32331e0e20.20260616.0707',
    )
    expect(
      searchWith('?trip=bus.5C.32331e0e20.20260616.0707', {
        hidden: new Set(),
        panel: { kind: 'stop', id: '8600626' },
      }),
    ).toBe('?stop=8600626')
    expect(searchWith('?stop=8600626', { hidden: new Set() })).toBe('')
  })

  it("reads and writes an open aircraft's card by its hex, beside the Planes filter", () => {
    expect(viewOf('?hide=aircraft&aircraft=4ab1e3')).toEqual({
      hidden: new Set(),
      aircraftHidden: true,
      panel: { kind: 'aircraft', id: '4ab1e3' },
    })
    expect(
      searchWith('?trip=bus.5C.32331e0e20.20260616.0707', {
        hidden: new Set(),
        panel: { kind: 'aircraft', id: '4ab1e3' },
      }),
    ).toBe('?aircraft=4ab1e3')
  })
})

describe("the view kept in the page's address", () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('keeps the same filters while the map moves, and new ones when a filter changes', () => {
    window.history.replaceState(null, '', '/?hide=bus')
    const store = addressView()
    const { hidden } = store.get()
    store.update({ centre: [12.5683, 55.6761], zoom: 12.5 })
    expect(store.get().hidden).toBe(hidden)
    store.update({ hidden: new Set(['bus', 'metro']) })
    expect([...store.get().hidden]).toEqual(['bus', 'metro'])
  })

  it('keeps the same open panel while the map moves, and renders its reader only when it changes', () => {
    window.history.replaceState(null, '', '/?stop=8600626')
    const store = addressView()
    let renders = 0
    function Panel() {
      renders++
      return <p>{usePanel(store)?.id}</p>
    }
    const { container } = render(<Panel />)
    const { panel } = store.get()
    act(() => store.update({ centre: [12.5683, 55.6761], zoom: 12.5 }))
    expect(store.get().panel).toBe(panel)
    expect(renders).toBe(1)
    act(() => store.update({ panel: { kind: 'stop', id: '8600017' } }))
    expect(container).toHaveTextContent('8600017')
    act(() => store.update({ panel: undefined }))
    expect(window.location.search).toBe('?map=12.50/55.67610/12.56830')
    expect(renders).toBe(3)
  })

  it('renders a component that reads the filters only when they change, not when the map moves', () => {
    const store = addressView()
    let renders = 0
    function Filters() {
      renders++
      return <p>{[...useHiddenModes(store)].join(', ')}</p>
    }
    render(<Filters />)
    act(() => store.update({ centre: [12.5683, 55.6761], zoom: 12.5 }))
    expect(renders).toBe(1)
    act(() => store.update({ hidden: new Set(['bus']) }))
    expect(renders).toBe(2)
  })

  it('renders a component that reads the Planes filter only when it turns', () => {
    const store = addressView()
    let renders = 0
    function Planes() {
      renders++
      return <p>{useAircraftHidden(store) ? 'hidden' : 'shown'}</p>
    }
    const { container } = render(<Planes />)
    act(() => store.update({ hidden: new Set(['bus']) }))
    expect(renders).toBe(1)
    act(() => store.update({ aircraftHidden: true }))
    expect(container).toHaveTextContent('hidden')
    expect(window.location.search).toBe('?hide=bus,aircraft')
    expect(renders).toBe(2)
  })
})
