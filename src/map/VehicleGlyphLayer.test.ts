import '@mylder/perron/tokens.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { between, inOrder, vertexShaderOf } from '../test/shaders.ts'
import type { Snapshot } from '../tracker/index.ts'
import { readPaint } from './paint.ts'
import { SCREEN_SIZE } from './screen-size.ts'
import { vehicleLayers } from './VehicleGlyphLayer.ts'
import { vehiclePaint, vehiclesOf } from './vehicles.ts'

// deck.gl draws with WebGL, which jsdom lacks: these tests read the layers' props, which say how
// each dot is drawn, and the vertex shader deck.gl assembles for them, which says where on the
// canvas a dot's outline and offset land.
const snapshot = JSON.parse(
  readFileSync(join(process.cwd(), 'recordings', 'weekday', 'snapshots', '0006.json'), 'utf8'),
) as Snapshot
const vehicles = vehiclesOf(
  snapshot,
  undefined,
  readPaint(document.documentElement, vehiclePaint()),
)

describe('the vehicles on the canvas', () => {
  it('draws every dot and its halo facing the screen, its size given in px', () => {
    for (const layer of vehicleLayers(vehicles, 1)) {
      expect(layer.props).toMatchObject({ radiusUnits: 'pixels', billboard: true })
    }
  })

  it('draws every dot at its px and its offset at its px however the map tilts', () => {
    // A billboard's outline and its offset onto its strand are added to its position in clip
    // space, which deck.gl scales by its focal distance: after the divide by w, that gives their
    // px only where w is the focal distance, at the canvas's centre, so on a tilted map a near dot
    // would come out bigger and a far one smaller, and its offset, already foreshortened by the
    // camera (offsets.ts), foreshortened again. Each layer scales them by w over the focal
    // distance first, so they land at exactly their px wherever the dot is. WebGL can't run here,
    // so this reads the shader that does it, step by step, as deck.gl assembles it.
    for (const layer of vehicleLayers(vehicles, 1)) {
      const vs = vertexShaderOf(layer)
      const billboard = between(vs, 'if (scatterplot.billboard) {', '} else {')
      const steps = [
        'gl_Position = project_position_to_clipspace(',
        'vec3 offset = edgePadding * positions * outerRadiusPixels;',
        'offset.xy += instancePixelOffset;',
        'DECKGL_FILTER_SIZE(offset, geometry);',
        'gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);',
      ]
      expect(inOrder(billboard, steps)).toBe(true)
      expect(between(vs, 'vec2 project_pixel_size_to_clipspace(', '}')).toContain(
        'return offset * project.focalDistance;',
      )
      expect(between(vs, 'void DECKGL_FILTER_SIZE(', '}')).toContain(SCREEN_SIZE.trim())
      expect(SCREEN_SIZE.trim()).toBe('size.xy *= gl_Position.w / project.focalDistance;')
    }
  })
})
