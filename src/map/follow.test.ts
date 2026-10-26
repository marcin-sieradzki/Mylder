import { afterEach, describe, expect, it } from 'vitest'
import { endsFollow, followStore, followTarget } from './follow.ts'
import { mapView, openPanel } from './view.ts'

// Follow, as vehicle detail gives it (docs/screens.md): where the camera goes each frame for the
// followed dot, and what ends it: the trip at its last stop or off the map, a pan by the viewer,
// and the panel closing.

const BUS = 'bus.5C.32331e0e20.20260616.0707'
const METRO = 'metro.M1.7f21f99145.20260616.0707'

/** Two dots as the canvas draws them: the bus at Nørreport, the Metro at Kongens Nytorv. */
const drawn = {
  keys: [BUS, METRO],
  positions: new Float64Array([12.5716, 55.6833, 12.5857, 55.6795]),
}

describe("Follow's camera", () => {
  it('centres on the followed dot where it is drawn this frame', () => {
    expect(followTarget(drawn, METRO, { progress: 4_200, end: 9_800 })).toEqual({
      centre: [12.5857, 55.6795],
      arrived: false,
    })
  })

  it('follows a dot that has no path to move along, where the snapshot put it', () => {
    expect(followTarget(drawn, BUS, undefined)).toEqual({
      centre: [12.5716, 55.6833],
      arrived: false,
    })
  })

  it('has arrived once the dot stands at its last stop', () => {
    expect(followTarget(drawn, BUS, { progress: 9_800, end: 9_800 })?.arrived).toBe(true)
    expect(followTarget(drawn, BUS, { progress: 9_799.5, end: 9_800 })?.arrived).toBe(true)
    expect(followTarget(drawn, BUS, { progress: 9_790, end: 9_800 })?.arrived).toBe(false)
  })

  it('has nowhere to go once the trip has left the map', () => {
    expect(followTarget(drawn, 's-tog.A.0bc307e3eb.20260616.0707', undefined)).toBeUndefined()
  })
})

describe('a camera move', () => {
  const move = (type?: string, touches = 1) => ({
    ...(type
      ? { originalEvent: Object.assign(new Event(type), { touches: { length: touches } }) }
      : {}),
  })

  it('ends Follow when the viewer drags the map, with a mouse or a finger', () => {
    expect(endsFollow(move('mousemove'))).toBe(true)
    expect(endsFollow(move('pointermove'))).toBe(true)
    expect(endsFollow(move('touchmove'))).toBe(true)
  })

  it('ends Follow when the viewer pans with the arrow keys', () => {
    expect(endsFollow(move('keydown'))).toBe(true)
  })

  it('keeps Follow through a zoom by the wheel, a double click or two fingers', () => {
    expect(endsFollow(move('wheel'))).toBe(false)
    expect(endsFollow(move('dblclick'))).toBe(false)
    expect(endsFollow(move('touchmove', 2))).toBe(false)
  })

  it("keeps Follow through the camera's own moves, which carry no event of the viewer's", () => {
    expect(endsFollow(move())).toBe(false)
  })
})

describe('the followed trip', () => {
  afterEach(() => openPanel(undefined))

  it('is followed from Follow until Follow is pressed again', () => {
    const follow = followStore(mapView)
    openPanel({ kind: 'trip', id: METRO })
    follow.start(METRO)
    expect(follow.get()).toBe(METRO)
    follow.stop()
    expect(follow.get()).toBeUndefined()
  })

  it('is let go when its panel closes, or another opens in its place', () => {
    const follow = followStore(mapView)
    const heard: (string | undefined)[] = []
    follow.subscribe(() => heard.push(follow.get()))
    openPanel({ kind: 'trip', id: BUS })
    follow.start(BUS)
    openPanel(undefined)
    expect(follow.get()).toBeUndefined()

    openPanel({ kind: 'trip', id: BUS })
    follow.start(BUS)
    openPanel({ kind: 'stop', id: '8600646' })
    expect(follow.get()).toBeUndefined()
    expect(heard).toEqual([BUS, undefined, BUS, undefined])
  })

  it('stays followed while the map moves under it', () => {
    const follow = followStore(mapView)
    openPanel({ kind: 'trip', id: BUS })
    follow.start(BUS)
    mapView.update({ centre: [12.57, 55.68], zoom: 13 })
    expect(follow.get()).toBe(BUS)
    follow.stop()
  })
})
