// The aircraft as the canvas draws them (docs/aircraft.md, "The browser"), above the vehicles in
// the same overlay: Perron's aircraft glyph (aircraft-glyphs.ts), turned to each one's track, on
// the vehicle dots' halo, in three icon layers, bottom to top: the halos, the bodies and the rims.
// The glyphs are masks in one atlas drawn from Perron's outline at the sizes its tokens give, so
// deck.gl tints each with its colour; a few lines of shader cut a No signal plane from the top left
// of its box to the bottom right on the screen, whatever its track. Laid out as one typed array per
// attribute, as the vehicles are: the positions are their own array, which the aircraft's motion
// writes into each frame (aircraft-loop.ts); the glyphs change only with a snapshot, a data state
// or a theme. WebGL is not tested in jsdom.
import 'client-only'
import type { Accessor, DefaultProps, Layer } from '@deck.gl/core'
import { IconLayer, type IconLayerProps } from '@deck.gl/layers'
import type { AircraftState } from '../domain/aircraft-state.ts'
import type { AircraftSnapshot, SnapshotAircraft } from '../tracker/aircraft/index.ts'
import { aircraftGlyphOf, type AircraftLook } from './aircraft-glyphs.ts'
import type { AircraftStates } from './aircraft-states.ts'
import type { DrawnKind, Project } from './picking.ts'

/**
 * The layer whose glyphs a pick finds: the halos, which every state fills, so a hollow Estimated
 * plane picks as well as a filled one.
 */
export const AIRCRAFT_LAYER = 'aircraft-halos'

/** The aircraft on the map as the canvas draws them, in the look read when they landed. */
export interface DrawnAircraft {
  readonly length: number
  /** Each aircraft drawn, in drawing order. */
  readonly aircraft: readonly SnapshotAircraft[]
  /** The same aircraft by their hexes. */
  readonly keys: readonly string[]
  /** Each one's data state now. */
  readonly states: readonly AircraftState[]
  /** Longitude and latitude, two per aircraft. */
  readonly positions: Float64Array
  /** Perron's outline, sizes and colours, which the glyphs below are drawn in. */
  readonly look: AircraftLook
  /** Each glyph's box, its rim's width inside the outline and its No signal cut, in px. */
  readonly size: Float32Array
  readonly rim: Float32Array
  readonly cut: Float32Array
  /** Red, green, blue and alpha, four per aircraft. */
  readonly fill: Uint8ClampedArray
  readonly line: Uint8ClampedArray
  /** Each one's turn from north, anticlockwise as deck.gl turns an icon. */
  readonly angle: Float32Array
}

/** What of the drawn aircraft their states and the look decide: all but where they are. */
type Glyphs = Omit<DrawnAircraft, 'length' | 'aircraft' | 'keys' | 'positions'>

/** The glyphs of `aircraft`, each in its state from `states`, in `look`. */
function glyphsOf(
  aircraft: readonly SnapshotAircraft[],
  states: readonly AircraftState[],
  look: AircraftLook,
): Glyphs {
  const n = aircraft.length
  const glyphs = {
    states,
    look,
    size: new Float32Array(n),
    rim: new Float32Array(n),
    cut: new Float32Array(n),
    fill: new Uint8ClampedArray(n * 4),
    line: new Uint8ClampedArray(n * 4),
    angle: new Float32Array(n),
  }
  aircraft.forEach((each, i) => {
    const glyph = aircraftGlyphOf(states[i], each, look)
    glyphs.size[i] = glyph.size
    glyphs.rim[i] = glyph.rim
    glyphs.cut[i] = glyph.cut
    glyphs.fill.set(glyph.fill, i * 4)
    glyphs.line.set(glyph.line, i * 4)
    glyphs.angle[i] = glyph.angle
  })
  return glyphs
}

/**
 * The aircraft of a snapshot on the map, each in its state from `states`, the states by the
 * clock, in the look read now. An aircraft `states` leaves out has been dropped and isn't drawn.
 * Each stands at its fix until its motion moves it.
 */
export function aircraftOf(
  snapshot: AircraftSnapshot,
  look: AircraftLook,
  states: AircraftStates,
): DrawnAircraft {
  const drawn = snapshot.aircraft.filter((each) => states.has(each.hex))
  const positions = new Float64Array(drawn.length * 2)
  drawn.forEach((each, i) => positions.set([each.lon, each.lat], i * 2))
  return {
    length: drawn.length,
    aircraft: drawn,
    keys: drawn.map((each) => each.hex),
    positions,
    ...glyphsOf(
      drawn,
      drawn.map((each) => states.get(each.hex)!),
      look,
    ),
  }
}

/**
 * The aircraft `drawn` in their `states` now, in `look`: only their glyphs made again, their
 * positions the same, which their motion goes on writing into. None when `states` has dropped
 * one of them, which changes what is drawn.
 */
export function restyled(
  drawn: DrawnAircraft,
  look: AircraftLook,
  states: AircraftStates,
): DrawnAircraft | undefined {
  if (states.size !== drawn.length || !drawn.keys.every((hex) => states.has(hex))) return undefined
  return {
    ...drawn,
    ...glyphsOf(
      drawn.aircraft,
      drawn.keys.map((hex) => states.get(hex)!),
      look,
    ),
  }
}

/** Texture px to a screen px: the atlas is drawn this much finer than the glyphs are shown. */
const RESOLUTION = 4

interface Sprite {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly mask: true
}

/** The glyphs as masks, deck.gl tinting each: a halo and a body for each box, and its rims. */
interface Atlas {
  readonly url: string
  readonly mapping: Readonly<Record<string, Sprite>>
  /** The side of each box's sprite in screen px: the box, its halo and a pixel to spare. */
  readonly cell: ReadonlyMap<number, number>
}

const haloOf = (size: number) => `halo/${size}`
const bodyOf = (size: number) => `body/${size}`
const rimOf = (size: number, rim: number) => (rim > 0 ? `rim/${size}/${rim}` : bodyOf(size))

/** Each look's atlas, by what it is drawn from, so a theme change keeps the same one. */
const atlases = new Map<string, Atlas>()

/**
 * The atlas of `look`'s glyphs: Perron's outline on its 14 px grid, scaled to each box about its
 * centre. A halo is the outline filled and stroked the halo's width on each side; a rim is the
 * outline stroked twice the rim's width and clipped to itself, so it lies inside.
 */
function atlasOf(look: AircraftLook): Atlas {
  const sizes = [...new Set([look.size.air, look.size.ground])]
  const rims = [...new Set([look.ageing.rim, look.estimated.rim])].filter((rim) => rim > 0)
  const key = JSON.stringify([look.outline, sizes, rims, look.halo.width])
  const known = atlases.get(key)
  if (known) return known
  const d = look.outline
  const mapping: Record<string, Sprite> = {}
  const cell = new Map<number, number>()
  const parts: string[] = []
  let x = 0
  let height = 0
  sizes.forEach((size) => {
    const side = Math.ceil((size + 2 * (look.halo.width + 1)) * RESOLUTION)
    cell.set(size, side / RESOLUTION)
    height = Math.max(height, side)
    // One grid unit in sprite px, and a width in screen px in grid units.
    const unit = (size * RESOLUTION) / 14
    const grid = (px: number) => (px * RESOLUTION) / unit
    const sprite = (name: string, body: string) => {
      mapping[name] = { x, y: 0, width: side, height: side, mask: true }
      parts.push(
        `<g transform="translate(${x + side / 2} ${side / 2}) scale(${unit}) translate(-7 -7)">${body}</g>`,
      )
      x += side
    }
    sprite(
      haloOf(size),
      `<path d="${d}" fill="#fff" stroke="#fff" stroke-linejoin="round" stroke-width="${grid(2 * look.halo.width)}"/>`,
    )
    sprite(bodyOf(size), `<path d="${d}" fill="#fff"/>`)
    rims.forEach((rim) => {
      const clip = `clip-${parts.length}`
      sprite(
        rimOf(size, rim),
        `<clipPath id="${clip}"><path d="${d}"/></clipPath>` +
          `<path d="${d}" fill="none" stroke="#fff" stroke-linejoin="round" stroke-width="${grid(2 * rim)}" clip-path="url(#${clip})"/>`,
      )
    })
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height}">${parts.join('')}</svg>`
  const atlas = {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    mapping,
    cell,
  }
  atlases.set(key, atlas)
  return atlas
}

type CutProps<D> = {
  /** The width in px of the No signal cut, a diagonal gap through the glyph; 0 for none. */
  getCut?: Accessor<D, number>
}

const cutModule = {
  name: 'aircraftCut',
  inject: {
    'vs:#decl': 'in float instanceCuts;\nout float vCut;\nout vec2 vFromCentre;\n',
    // The icon's corner from its centre in screen px, turned with it, y up: across the glyph it
    // runs over each pixel's own place on the screen.
    'vs:#main-end': 'vCut = instanceCuts;\nvFromCentre = pixelOffset;\n',
    'fs:#decl': 'in float vCut;\nin vec2 vFromCentre;\n',
    // x + y = 0 is the diagonal from the top left to the bottom right; a pixel's distance from it
    // is |x + y| / sqrt(2).
    'fs:#main-start':
      'if (vCut > 0.0 && abs(vFromCentre.x + vFromCentre.y) * 0.70710678 < vCut * 0.5) discard;\n',
  },
}

/** An icon layer with one more attribute per aircraft: the width of its No signal cut. */
class AircraftIconLayer<D = unknown> extends IconLayer<D, CutProps<D>> {
  static override layerName = 'AircraftIconLayer'
  static override defaultProps = {
    ...IconLayer.defaultProps,
    getCut: { type: 'accessor', value: 0 },
  } as DefaultProps<IconLayerProps<unknown> & CutProps<unknown>>

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

/**
 * Each set of aircraft's glyph attributes as deck.gl takes them, made once, so a frame or a zoom
 * uploads only the positions and looks up only each one's sprites.
 */
const binary = new WeakMap<DrawnAircraft, ReturnType<typeof attributesOf>>()

/** A sprite for each aircraft, by its index, as deck.gl asks for it. */
const spriteOf =
  (names: readonly string[]) =>
  (_: unknown, { index }: { index: number }) =>
    names[index]

function attributesOf(drawn: DrawnAircraft) {
  const atlas = atlasOf(drawn.look)
  const sizes = [...drawn.size]
  const shared = {
    getSize: { value: Float32Array.from(sizes, (size) => atlas.cell.get(size) ?? 0), size: 1 },
    getAngle: { value: drawn.angle, size: 1 },
  }
  return {
    atlas,
    haloColour: [...drawn.look.halo.colour] as [number, number, number, number],
    halos: { attributes: shared, getIcon: spriteOf(sizes.map(haloOf)) },
    bodies: {
      attributes: {
        ...shared,
        getColor: { value: drawn.fill, size: 4 },
        getCut: { value: drawn.cut, size: 1 },
      },
      getIcon: spriteOf(sizes.map(bodyOf)),
    },
    rims: {
      attributes: {
        ...shared,
        getColor: { value: drawn.line, size: 4 },
        getCut: { value: drawn.cut, size: 1 },
      },
      getIcon: spriteOf(sizes.map((size, i) => rimOf(size, drawn.rim[i]))),
    },
  }
}

/**
 * The layers that draw the aircraft where their positions are now, each glyph `radiusScale` times
 * Perron's size, as the vehicle dots are. deck.gl uploads an attribute again only when it is
 * handed a new one, so the positions are new on every call.
 */
export function aircraftLayers(drawn: DrawnAircraft, radiusScale: number): Layer[] {
  let data = binary.get(drawn)
  if (!data) binary.set(drawn, (data = attributesOf(drawn)))
  const { length } = drawn
  const { atlas } = data
  const moving = { getPosition: { value: drawn.positions, size: 2 } }
  const icons = {
    iconAtlas: atlas.url,
    iconMapping: atlas.mapping,
    sizeUnits: 'pixels',
    sizeScale: radiusScale,
  } as const
  return [
    new IconLayer({
      id: AIRCRAFT_LAYER,
      data: { length, attributes: { ...data.halos.attributes, ...moving } },
      ...icons,
      getIcon: data.halos.getIcon,
      getColor: data.haloColour,
      // deck.gl picks within the overlay's picking radius of the pointer (picking.ts).
      pickable: true,
    }),
    new AircraftIconLayer({
      id: 'aircraft',
      data: { length, attributes: { ...data.bodies.attributes, ...moving } },
      ...icons,
      getIcon: data.bodies.getIcon,
      pickable: false,
    }),
    new AircraftIconLayer({
      id: 'aircraft-rims',
      data: { length, attributes: { ...data.rims.attributes, ...moving } },
      ...icons,
      getIcon: data.rims.getIcon,
      pickable: false,
    }),
  ]
}

/** Where the `i`th aircraft is drawn in the canvas. */
const drawnAt = (drawn: DrawnAircraft, i: number, project: Project): [number, number] => {
  const { x, y } = project([drawn.positions[i * 2], drawn.positions[i * 2 + 1]])
  return [x, y]
}

const aircraftKinds = new WeakMap<DrawnAircraft, DrawnKind>()

/** The aircraft as a drawn kind, the same one for each set of aircraft. */
export function aircraftDrawn(drawn: DrawnAircraft): DrawnKind {
  let kind = aircraftKinds.get(drawn)
  if (!kind) {
    kind = {
      kind: 'aircraft',
      keys: drawn.keys,
      picks: AIRCRAFT_LAYER,
      at: (i, project) => drawnAt(drawn, i, project),
      layers: (radiusScale) => aircraftLayers(drawn, radiusScale),
    }
    aircraftKinds.set(drawn, kind)
  }
  return kind
}
