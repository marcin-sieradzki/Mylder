// A ScatterplotLayer with one more per-vehicle attribute: the width in pixels of the No signal
// cut, a diagonal gap from top left to bottom right that shows the map beneath. deck.gl can't
// draw that with any stock prop, so a few lines of fragment shader are injected, the same way
// PathStyleExtension injects the dashed ring. A cut of 0 draws a plain circle.
import { ScatterplotLayer, type ScatterplotLayerProps } from '@deck.gl/layers'
import type { Accessor, DefaultProps } from '@deck.gl/core'

type ExtraProps<D> = {
  getCut?: Accessor<D, number>
  /** MapLibreOverlay only: the style layer to draw beneath when interleaved. */
  beforeId?: string
}
export type VehicleGlyphLayerProps<D = unknown> = ScatterplotLayerProps<D> & ExtraProps<D>

const cutModule = {
  name: 'vehicleCut',
  inject: {
    'vs:#decl': 'in float instanceCuts;\nout float vCut;\n',
    'vs:#main-end': 'vCut = instanceCuts;\n',
    'fs:#decl': 'in float vCut;\n',
    // unitPosition is -1..1 across the dot with y up, so x + y = 0 is the top-left to
    // bottom-right diagonal. Distance to it in pixels: |x + y| / sqrt(2) * outer radius.
    'fs:#main-start':
      'if (vCut > 0.0 && abs(unitPosition.x + unitPosition.y) * 0.70710678 * outerRadiusPixels < vCut * 0.5) discard;\n',
  },
}

export class VehicleGlyphLayer<D = unknown> extends ScatterplotLayer<D, ExtraProps<D>> {
  static override layerName = 'VehicleGlyphLayer'
  static override defaultProps = {
    ...ScatterplotLayer.defaultProps,
    getCut: { type: 'accessor', value: 0 },
  } as DefaultProps<VehicleGlyphLayerProps>

  override getShaders() {
    const shaders = super.getShaders()
    return {
      ...shaders,
      modules: [...shaders.modules, cutModule as unknown as (typeof shaders.modules)[number]],
    }
  }

  override initializeState() {
    super.initializeState()
    this.getAttributeManager()?.addInstanced({
      instanceCuts: { size: 1, accessor: 'getCut' },
    })
  }
}
