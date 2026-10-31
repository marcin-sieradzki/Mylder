import '@mylder/perron/tokens.css'
import type { Layer } from '@deck.gl/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aircraftLookNow } from '../test/aircraftIcon.ts'
import { between, inOrder, vertexShaderOf } from '../test/shaders.ts'
import type { AircraftSnapshot } from '../tracker/aircraft/index.ts'
import { aircraftLayers, aircraftOf } from './AircraftGlyphLayer.ts'
import { aircraftStatesAt } from './aircraft-states.ts'
import { SCREEN_SIZE } from './screen-size.ts'

// deck.gl draws with WebGL, which jsdom lacks: these tests read the layers' props, which say
// which of the atlas's glyphs each plane is drawn with.
const snapshot = JSON.parse(
  readFileSync(
    join(process.cwd(), 'recordings', 'weekday', 'answers', 'aircraft', '0001.json'),
    'utf8',
  ),
) as AircraftSnapshot
const drawn = aircraftOf(snapshot, aircraftLookNow(), aircraftStatesAt(snapshot, snapshot.fetched))

/** Each plane's turn in `layer`, anticlockwise from up the canvas, as deck.gl turns an icon. */
const anglesIn = (layer: Layer) => {
  const { data } = layer.props as unknown as {
    data: { attributes: { getAngle: { value: Float32Array } } }
  }
  return [...data.attributes.getAngle.value]
}

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
    const layers = aircraftLayers(drawn, 1, 0)
    for (const layer of layers) {
      for (let i = 0; i < drawn.length; i++) expect(spriteIn(layer, i)).toBeDefined()
    }
  })

  it('draws a hollow Estimated plane with a rim, not the body it leaves unfilled', () => {
    const estimated = drawn.states.indexOf('estimated')
    expect(estimated).toBeGreaterThanOrEqual(0)
    const [, bodies, rims] = aircraftLayers(drawn, 1, 0)
    expect(spriteIn(rims, estimated)).toBeDefined()
    expect(spriteIn(rims, estimated)).not.toBe(spriteIn(bodies, estimated))
  })

  it("points each plane along its track less the map's heading", () => {
    const mmd = drawn.keys.indexOf('458d99')
    const grl = drawn.keys.indexOf('45ab23')
    // Facing north, MMD109 flying 60.38° points that far clockwise from up the canvas, and
    // GRL1762, flying 267.19°, nearly to the left.
    for (const layer of aircraftLayers(drawn, 1, 0)) {
      expect(anglesIn(layer)[mmd]).toBeCloseTo(-60.38, 4)
      expect(anglesIn(layer)[grl]).toBeCloseTo(-267.19, 4)
    }
    // Turned to face east, MMD109 points a little left of up, and GRL1762 nearly down.
    for (const layer of aircraftLayers(drawn, 1, 90)) {
      expect(anglesIn(layer)[mmd]).toBeCloseTo(29.62, 4)
      expect(anglesIn(layer)[grl]).toBeCloseTo(-177.19, 4)
    }
  })

  it('draws every plane at its px near and far, however the map tilts', () => {
    // As the vehicle dots are: deck.gl adds an icon's outline to its position in clip space scaled
    // by the focal distance, so after the divide by w it has its px only at the canvas's centre,
    // and on a tilted map a plane at the foot of the view would be drawn bigger than one at the
    // top. Each layer scales the outline by w over the focal distance first.
    for (const layer of aircraftLayers(drawn, 1, 0)) {
      expect(layer.props).toMatchObject({ sizeUnits: 'pixels', billboard: true })
      const vs = vertexShaderOf(layer)
      const billboard = between(vs, 'if (icon.billboard)', '} else {')
      const steps = [
        'gl_Position = project_position_to_clipspace(',
        'vec3 offset = vec3(pixelOffset, 0.0);',
        'DECKGL_FILTER_SIZE(offset, geometry);',
        'gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);',
      ]
      expect(inOrder(billboard, steps)).toBe(true)
      expect(between(vs, 'void DECKGL_FILTER_SIZE(', '}')).toContain(SCREEN_SIZE.trim())
    }
  })
})
