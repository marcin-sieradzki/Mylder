import '@mylder/perron/tokens.css'
import type { Layer } from '@deck.gl/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aircraftLookNow } from '../test/aircraftIcon.ts'
import type { AircraftSnapshot } from '../tracker/aircraft/index.ts'
import { aircraftLayers, aircraftOf } from './AircraftGlyphLayer.ts'
import { aircraftStatesAt } from './aircraft-states.ts'

// deck.gl draws with WebGL, which jsdom lacks: these tests read the layers' props, which say
// which of the atlas's glyphs each plane is drawn with.
const snapshot = JSON.parse(
  readFileSync(
    join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', '0001.json'),
    'utf8',
  ),
) as AircraftSnapshot
const drawn = aircraftOf(snapshot, aircraftLookNow(), aircraftStatesAt(snapshot, snapshot.fetched))

interface IconProps {
  readonly iconMapping: Readonly<Record<string, unknown>>
  readonly getIcon: (object: unknown, info: { index: number }) => string
}

/** The glyph of the `i`th plane in `layer`, as its atlas holds it; none where it holds none. */
const spriteIn = (layer: Layer, i: number) => {
  const { iconMapping, getIcon } = layer.props as unknown as IconProps
  return iconMapping[getIcon(null, { index: i })]
}

describe('the planes on the canvas', () => {
  it('draws every plane with a halo, a body and a rim the atlas holds', () => {
    const layers = aircraftLayers(drawn, 1)
    for (const layer of layers) {
      for (let i = 0; i < drawn.length; i++) expect(spriteIn(layer, i)).toBeDefined()
    }
  })

  it('draws a hollow Estimated plane with a rim, not the body it leaves unfilled', () => {
    const estimated = drawn.states.indexOf('estimated')
    expect(estimated).toBeGreaterThanOrEqual(0)
    const [, bodies, rims] = aircraftLayers(drawn, 1)
    expect(spriteIn(rims, estimated)).toBeDefined()
    expect(spriteIn(rims, estimated)).not.toBe(spriteIn(bodies, estimated))
  })
})
