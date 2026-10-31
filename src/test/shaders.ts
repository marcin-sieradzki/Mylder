// The vertex shader deck.gl assembles for a layer, for the map's tests: WebGL can't run in jsdom,
// so a test reads the shader's steps to say where on the canvas a glyph's outline lands.
import { getShaderAssembler, type Layer } from '@deck.gl/core'
import { expect } from 'vitest'

/** The vertex shader deck.gl would compile for `layer`, assembled as on a WebGL device. */
export function vertexShaderOf(layer: Layer) {
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
export const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start)
  expect(from).toBeGreaterThanOrEqual(0)
  return source.slice(from, source.indexOf(end, from) + end.length)
}

/** Whether each of `steps` is in `source`, in their order. */
export const inOrder = (source: string, steps: readonly string[]) => {
  const at = steps.map((step) => source.indexOf(step))
  return at.every((index) => index >= 0) && at.every((index, i) => i === 0 || index > at[i - 1])
}
