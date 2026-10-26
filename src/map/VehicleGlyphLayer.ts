// The vehicles' deck.gl layers, as the map-layer prototype (#14) settled them: a land-coloured
// halo under every dot, then the glyph, a scatterplot whose Timetable only ring is dashed by the
// path-style extension and whose No signal dot is cut by a few lines of shader. A few more fade
// a dot, halo and all, while it jumps to a far new place. deck.gl draws them over the map in its
// own canvas (ADR 0003). WebGL is not tested in jsdom.
import 'client-only'
import type { Accessor, DefaultProps, Layer } from '@deck.gl/core'
import { PathStyleExtension } from '@deck.gl/extensions'
import { ScatterplotLayer, type ScatterplotLayerProps } from '@deck.gl/layers'
import { PICKED_LAYER, type DrawnKind, type Project } from './picking.ts'
import type { Vehicles } from './vehicles.ts'

type CutProps<D> = {
  /** The width in px of the No signal cut, a diagonal gap through the dot; 0 for none. */
  getCut?: Accessor<D, number>
  /** How opaque the whole dot is drawn, 0 to 1. */
  getOpacity?: Accessor<D, number>
}

const cutModule = {
  name: 'vehicleCut',
  inject: {
    'vs:#decl':
      'in float instanceCuts;\nin float instanceOpacities;\nout float vCut;\nout float vOpacity;\n',
    'vs:#main-end': 'vCut = instanceCuts;\nvOpacity = instanceOpacities;\n',
    'fs:#decl': 'in float vCut;\nin float vOpacity;\n',
    // unitPosition runs -1 to 1 across the dot, y up, so x + y = 0 is the diagonal from top left
    // to bottom right; its distance in px is |x + y| / sqrt(2) times the outer radius.
    'fs:#main-start':
      'if (vCut > 0.0 && abs(unitPosition.x + unitPosition.y) * 0.70710678 * outerRadiusPixels < vCut * 0.5) discard;\n',
    'fs:DECKGL_FILTER_COLOR': 'color.a *= vOpacity;\n',
  },
}

/**
 * A scatterplot with two more attributes per vehicle: the width of its No signal cut, and how
 * opaque it is drawn. The aircraft's stand-in glyphs (AircraftGlyphLayer.ts) are drawn with it too.
 */
export class VehicleGlyphLayer<D = unknown> extends ScatterplotLayer<D, CutProps<D>> {
  static override layerName = 'VehicleGlyphLayer'
  static override defaultProps = {
    ...ScatterplotLayer.defaultProps,
    getCut: { type: 'accessor', value: 0 },
    getOpacity: { type: 'accessor', value: 1 },
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
      instanceOpacities: { size: 1, accessor: 'getOpacity' },
    })
  }
}

const dashed = [new PathStyleExtension({ dash: true })]

/**
 * Each vehicle set's glyph attributes as deck.gl takes them, made once, so a frame or a zoom
 * uploads only the positions, offsets and opacities.
 */
const binary = new WeakMap<Vehicles, ReturnType<typeof attributesOf>>()

function attributesOf(vehicles: Vehicles) {
  return {
    haloColour: [...vehicles.haloColour] as [number, number, number, number],
    halos: { getRadius: { value: vehicles.haloRadius, size: 1 } },
    glyphs: {
      getRadius: { value: vehicles.radius, size: 1 },
      getLineWidth: { value: vehicles.lineWidth, size: 1 },
      getFillColor: { value: vehicles.fill, size: 4 },
      getLineColor: { value: vehicles.line, size: 4 },
      getDashArray: { value: vehicles.dash, size: 2 },
      getCut: { value: vehicles.cut, size: 1 },
    },
  }
}

/**
 * The layers that draw the vehicles where their positions are now, each dot `radiusScale` times
 * Perron's size. deck.gl uploads an attribute again only when it is handed a new one, so the
 * moving ones are new on every call.
 */
export function vehicleLayers(vehicles: Vehicles, radiusScale: number): Layer[] {
  let data = binary.get(vehicles)
  if (!data) binary.set(vehicles, (data = attributesOf(vehicles)))
  const { length } = vehicles
  const moving = {
    getPosition: { value: vehicles.positions, size: 2 },
    // East and north in px, as deck.gl's common space runs, y up.
    getPixelOffset: { value: vehicles.offsets, size: 2 },
    getOpacity: { value: vehicles.opacity, size: 1 },
  }
  return [
    new VehicleGlyphLayer({
      id: 'vehicle-halos',
      data: { length, attributes: { ...data.halos, ...moving } },
      radiusUnits: 'pixels',
      radiusScale,
      filled: true,
      stroked: false,
      getFillColor: data.haloColour,
      pickable: false,
    }),
    new VehicleGlyphLayer({
      id: PICKED_LAYER,
      data: { length, attributes: { ...data.glyphs, ...moving } },
      radiusUnits: 'pixels',
      radiusScale,
      lineWidthUnits: 'pixels',
      filled: true,
      stroked: true,
      antialiasing: true,
      extensions: dashed,
      // deck.gl picks within the overlay's picking radius of the pointer (picking.ts).
      pickable: true,
    }),
  ]
}

/** Where the `i`th vehicle is drawn in the canvas: its position, moved by its offset onto its strand. */
function drawnAt(vehicles: Vehicles, i: number, project: Project): [number, number] {
  const { x, y } = project([vehicles.positions[i * 2], vehicles.positions[i * 2 + 1]])
  return [x + vehicles.offsets[i * 2], y - vehicles.offsets[i * 2 + 1]]
}

const tripKinds = new WeakMap<Vehicles, DrawnKind>()

/** The vehicles as a drawn kind, the same one for each set of vehicles. */
export function tripsDrawn(vehicles: Vehicles): DrawnKind {
  let kind = tripKinds.get(vehicles)
  if (!kind) {
    kind = {
      kind: 'trip',
      keys: vehicles.keys,
      picks: PICKED_LAYER,
      at: (i, project) => drawnAt(vehicles, i, project),
      layers: (radiusScale) => vehicleLayers(vehicles, radiusScale),
    }
    tripKinds.set(vehicles, kind)
  }
  return kind
}
