// The vehicles' deck.gl layers, as the map-layer prototype (#14) settled them: a land-coloured
// halo under every dot, then the glyph, a scatterplot whose Timetable only ring is dashed by the
// path-style extension and whose No signal dot is cut by a few lines of shader. deck.gl draws
// them over the map in its own canvas (ADR 0003). WebGL is not tested in jsdom.
import 'client-only'
import type { Accessor, DefaultProps, Layer } from '@deck.gl/core'
import { PathStyleExtension } from '@deck.gl/extensions'
import { ScatterplotLayer, type ScatterplotLayerProps } from '@deck.gl/layers'
import type { Vehicles } from './vehicles.ts'

type CutProps<D> = {
  /** The width in px of the No signal cut, a diagonal gap through the dot; 0 for none. */
  getCut?: Accessor<D, number>
}

const cutModule = {
  name: 'vehicleCut',
  inject: {
    'vs:#decl': 'in float instanceCuts;\nout float vCut;\n',
    'vs:#main-end': 'vCut = instanceCuts;\n',
    'fs:#decl': 'in float vCut;\n',
    // unitPosition runs -1 to 1 across the dot, y up, so x + y = 0 is the diagonal from top left
    // to bottom right; its distance in px is |x + y| / sqrt(2) times the outer radius.
    'fs:#main-start':
      'if (vCut > 0.0 && abs(unitPosition.x + unitPosition.y) * 0.70710678 * outerRadiusPixels < vCut * 0.5) discard;\n',
  },
}

/** A scatterplot with one more attribute per vehicle: the width of its No signal cut. */
class VehicleGlyphLayer<D = unknown> extends ScatterplotLayer<D, CutProps<D>> {
  static override layerName = 'VehicleGlyphLayer'
  static override defaultProps = {
    ...ScatterplotLayer.defaultProps,
    getCut: { type: 'accessor', value: 0 },
  } as DefaultProps<ScatterplotLayerProps<unknown> & CutProps<unknown>>

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

const dashed = [new PathStyleExtension({ dash: true })]

/** Each vehicle set's attributes as deck.gl takes them, made once so a zoom uploads nothing. */
const binary = new WeakMap<Vehicles, ReturnType<typeof attributesOf>>()

function attributesOf(vehicles: Vehicles) {
  const { length } = vehicles
  const getPosition = { value: vehicles.positions, size: 2 }
  return {
    haloColour: [...vehicles.haloColour] as [number, number, number, number],
    halos: {
      length,
      attributes: { getPosition, getRadius: { value: vehicles.haloRadius, size: 1 } },
    },
    glyphs: {
      length,
      attributes: {
        getPosition,
        getRadius: { value: vehicles.radius, size: 1 },
        getLineWidth: { value: vehicles.lineWidth, size: 1 },
        getFillColor: { value: vehicles.fill, size: 4 },
        getLineColor: { value: vehicles.line, size: 4 },
        getDashArray: { value: vehicles.dash, size: 2 },
        getCut: { value: vehicles.cut, size: 1 },
      },
    },
  }
}

/** The layers that draw the vehicles, each dot `radiusScale` times Perron's size. */
export function vehicleLayers(vehicles: Vehicles, radiusScale: number): Layer[] {
  let data = binary.get(vehicles)
  if (!data) binary.set(vehicles, (data = attributesOf(vehicles)))
  return [
    new ScatterplotLayer({
      id: 'vehicle-halos',
      data: data.halos,
      radiusUnits: 'pixels',
      radiusScale,
      filled: true,
      stroked: false,
      getFillColor: data.haloColour,
      pickable: false,
    }),
    new VehicleGlyphLayer({
      id: 'vehicles',
      data: data.glyphs,
      radiusUnits: 'pixels',
      radiusScale,
      lineWidthUnits: 'pixels',
      filled: true,
      stroked: true,
      antialiasing: true,
      extensions: dashed,
      pickable: false,
    }),
  ]
}
