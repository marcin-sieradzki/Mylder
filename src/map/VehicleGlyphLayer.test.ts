import '@mylder/perron/tokens.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getShaderAssembler, type Layer } from '@deck.gl/core'
import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../tracker/index.ts'
import { readPaint } from './paint.ts'
import { SCREEN_SIZE, vehicleLayers } from './VehicleGlyphLayer.ts'
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

/** The vertex shader deck.gl would compile for `layer`, assembled as on a WebGL device. */
function vertexShaderOf(layer: Layer) {
  Object.assign(layer, {
    context: { device: { type: 'webgl' }, defaultShaderModules: [] },
    state: {},
  })
  const shaders = (layer as unknown as { getShaders(): object }).getShaders()
  const platformInfo = {
    type: 'webgl',
    shaderLanguage: 'glsl',
    shaderLanguageVersion: 300,
    gpu: 'jsdom',
    features: new Set(),
  }
  // deck.gl's GLSL assembler, which its types give as the base of every language's.
  const assembler = getShaderAssembler('glsl') as unknown as {
    assembleGLSLShaderPair(props: object): { vs: string }
  }
  return assembler.assembleGLSLShaderPair({ platformInfo, ...shaders }).vs
}

/** The text of `source` from `start` to the first `end` after it. */
const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start)
  expect(from).toBeGreaterThanOrEqual(0)
  return source.slice(from, source.indexOf(end, from) + end.length)
}

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
      const at = steps.map((step) => billboard.indexOf(step))
      expect(at.every((index) => index >= 0)).toBe(true)
      expect(at).toEqual([...at].sort((a, b) => a - b))
      expect(between(vs, 'vec2 project_pixel_size_to_clipspace(', '}')).toContain(
        'return offset * project.focalDistance;',
      )
      expect(between(vs, 'void DECKGL_FILTER_SIZE(', '}')).toContain(SCREEN_SIZE.trim())
      expect(SCREEN_SIZE.trim()).toBe('size.xy *= gl_Position.w / project.focalDistance;')
    }
  })
})
