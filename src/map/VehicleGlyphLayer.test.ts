import '@mylder/perron/tokens.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../tracker/index.ts'
import { readPaint } from './paint.ts'
import { vehicleLayers } from './VehicleGlyphLayer.ts'
import { vehiclePaint, vehiclesOf } from './vehicles.ts'

// deck.gl draws with WebGL, which jsdom lacks: these tests read the layers' props, which say how
// each dot is drawn.
const snapshot = JSON.parse(
  readFileSync(join(process.cwd(), 'recordings', 'weekday', 'snapshots', '0006.json'), 'utf8'),
) as Snapshot
const vehicles = vehiclesOf(snapshot, undefined, readPaint(document.documentElement, vehiclePaint()))

describe('the vehicles on the canvas', () => {
  it('draws every dot and its halo at one size in px, facing the screen however the map tilts', () => {
    for (const layer of vehicleLayers(vehicles, 1)) {
      expect(layer.props).toMatchObject({ radiusUnits: 'pixels', billboard: true })
    }
  })
})
