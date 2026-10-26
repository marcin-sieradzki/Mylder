import { describe, expect, it } from 'vitest'
import { viewOf } from './view.ts'

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
