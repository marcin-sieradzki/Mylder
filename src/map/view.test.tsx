import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { addressView, useHiddenModes, viewOf } from './view.ts'

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
})
