import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { mapCamera, type CameraMap } from '../map/camera'
import { followCamera, followedVehicle, type FollowMap } from '../map/follow'
import { motionPause } from '../map/pause'
import { pickedVehicle } from '../map/picking'
import { MapTools } from './MapTools'
import { Providers } from './Providers'

/** The drawing of the Perron icon a button holds. */
const iconOf = (button: HTMLElement) => button.querySelector('svg.perron-icon')?.innerHTML

/** Where a camera move goes: any of MapLibre's camera options. */
interface Target {
  readonly center?: [number, number]
  readonly zoom?: number
  readonly bearing?: number
  readonly pitch?: number
}

/**
 * MapLibre's map, which needs WebGL that jsdom lacks: between zoom 6 and 18 and tilted up to 60°,
 * its zooms and pans move it at once, its pans in pixels at the centre, as MapLibre does under
 * reduced motion. An ease is under way until `settle` ends it, and a jump lands at once. A move
 * tells its listeners as MapLibre's does, `movestart` carrying the input the viewer made it with.
 */
function fakeMap() {
  const container = document.createElement('div')
  document.body.append(container)
  const listeners = new Map<string, Set<(event: object) => void>>()
  const state = {
    zoom: 11.2,
    center: { lng: 12.565, lat: 55.68 },
    bearing: 0,
    pitch: 0,
    panned: [0, 0],
    easing: undefined as Target | undefined,
  }
  const tell = (type: string, event: object = {}) => {
    for (const listener of listeners.get(type) ?? []) listener(event)
  }
  const moved = (eventData: object = {}) => {
    tell('movestart', eventData)
    tell('move', eventData)
    tell('moveend', eventData)
  }
  const land = ({ center, zoom, bearing, pitch }: Target) => {
    if (center) state.center = { lng: center[0], lat: center[1] }
    if (center) state.panned = [0, 0]
    if (zoom !== undefined) state.zoom = zoom
    // MapLibre turns a heading into -180 to 180, and keeps the tilt within 0 to its most.
    if (bearing !== undefined) state.bearing = ((((bearing + 180) % 360) + 360) % 360) - 180
    if (pitch !== undefined) state.pitch = Math.min(60, Math.max(0, pitch))
  }
  const map = {
    getZoom: () => state.zoom,
    getMinZoom: () => 6,
    getMaxZoom: () => 18,
    getMaxPitch: () => 60,
    getCenter: () => state.center,
    getBearing: () => state.bearing,
    getPitch: () => state.pitch,
    getContainer: () => container,
    isMoving: () => state.easing !== undefined,
    scrollZoom: { enable: () => {} },
    zoomIn: () => {
      state.zoom = Math.min(18, state.zoom + 1)
      moved()
    },
    zoomOut: () => {
      state.zoom = Math.max(6, state.zoom - 1)
      moved()
    },
    panBy: ([x, y]: [number, number], _?: object, eventData?: object) => {
      state.panned = [state.panned[0] + x, state.panned[1] + y]
      moved(eventData)
    },
    easeTo: (target: Target, eventData: object = {}) => {
      state.easing = target
      tell('movestart', eventData)
    },
    jumpTo: (target: Target, eventData?: object) => {
      land(target)
      moved(eventData)
    },
    on: (type: string, listener: (event: object) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    off: (type: string, listener: (event: object) => void) => listeners.get(type)?.delete(listener),
  }
  /** Ends the ease under way where it was going. */
  const settle = () => {
    const target = state.easing
    if (!target) return
    state.easing = undefined
    land(target)
    tell('move')
    tell('moveend')
  }
  /** Moves the camera as a gesture would. */
  const gesture = (target: Target) =>
    act(() => map.jumpTo(target, { originalEvent: new Event('mousemove') }))
  return { map: map as unknown as CameraMap, state, container, settle, gesture }
}

let detach: (() => void) | undefined
let mapElement: HTMLElement | undefined

/** The tools over a map that opened at zoom 11.2 on Copenhagen's centre. */
function open(lang: Lang = 'en') {
  const fake = fakeMap()
  mapElement = fake.container
  detach = mapCamera.attach(fake.map, () => ({ center: [12.565, 55.68], zoom: 11.2 }))
  render(
    <Providers lang={lang} dictionary={lang === 'da' ? da : en}>
      <MapTools />
    </Providers>,
  )
  return fake
}

afterEach(() => {
  detach?.()
  motionPause.set(false)
  pickedVehicle.clear()
  mapElement?.remove()
})

describe('the map controls', () => {
  it('gives every control a name, in English', () => {
    open()
    const controls = screen.getByRole('toolbar', { name: 'Map controls' })
    expect(within(controls).getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
    expect(within(controls).getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()
    expect(within(controls).getByRole('button', { name: 'Centre the map' })).toBeInTheDocument()
    expect(within(controls).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    for (const button of screen.getAllByRole('button')) expect(button).toHaveAccessibleName()
    expect(screen.getByText('Scale')).toBeInTheDocument()
  })

  it('gives every control a name, in Danish', () => {
    open('da')
    const controls = screen.getByRole('toolbar', { name: 'Kortknapper' })
    expect(within(controls).getByRole('button', { name: 'Zoom ind' })).toBeInTheDocument()
    expect(within(controls).getByRole('button', { name: 'Zoom ud' })).toBeInTheDocument()
    expect(within(controls).getByRole('button', { name: 'Centrér kortet' })).toBeInTheDocument()
    expect(within(controls).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    for (const button of screen.getAllByRole('button')) expect(button).toHaveAccessibleName()
  })

  it('zooms, resets the view, and pauses and resumes the motion', async () => {
    const user = userEvent.setup()
    const { state, settle } = open()
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(state.zoom).toBeCloseTo(13.2)
    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(state.zoom).toBeCloseTo(12.2)
    await user.click(screen.getByRole('button', { name: 'Centre the map' }))
    act(settle)
    expect(state.zoom).toBeCloseTo(11.2)

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(motionPause.get()).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(motionPause.get()).toBe(false)
  })

  it("draws the pause as Perron's own icon, pause while moving and play while paused, named in words", async () => {
    const user = userEvent.setup()
    open('da')
    const pause = screen.getByRole('button', { name: 'Pause' })
    expect(pause).not.toHaveTextContent(/\S/)
    const drawn = iconOf(pause)
    expect(drawn).toBeTruthy()
    await user.click(pause)
    const resume = screen.getByRole('button', { name: 'Fortsæt' })
    expect(resume).not.toHaveTextContent(/\S/)
    expect(iconOf(resume)).toBeTruthy()
    expect(iconOf(resume)).not.toBe(drawn)
  })

  it('gives the scale bar the ground a pixel spans, and dims zoom in at the closest zoom', async () => {
    const user = userEvent.setup()
    const { state } = open()
    // Web Mercator on 512 px tiles: 78 271.5 m a pixel at the equator at zoom 0, so at 55.68° N
    // about 18.75 m at zoom 11.2 and 0.17 m at 18.
    expect(mapCamera.get()?.metersPerPixel).toBeCloseTo(18.75, 1)
    for (let i = 0; i < 7; i++) await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(state.zoom).toBe(18)
    expect(mapCamera.get()?.metersPerPixel).toBeCloseTo(0.17, 2)
    expect(screen.getByRole('button', { name: 'Zoom in' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('eases the view back to flat, north-up and the place it opened on', async () => {
    const user = userEvent.setup()
    const { state, settle, gesture } = open()
    gesture({ center: [12.6, 55.7], zoom: 14, pitch: 40, bearing: 70 })
    await user.click(screen.getByRole('button', { name: 'Centre the map' }))
    // Under way, the map hasn't reached it yet.
    expect(state).toMatchObject({ zoom: 14, pitch: 40, bearing: 70 })
    act(settle)
    expect(state).toMatchObject({
      zoom: 11.2,
      center: { lng: 12.565, lat: 55.68 },
      pitch: 0,
      bearing: 0,
    })
  })

  it('jumps back at once when the system asks for reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    onTestFinished(() => void vi.unstubAllGlobals())
    const user = userEvent.setup()
    const { state, gesture } = open()
    gesture({ center: [12.6, 55.7], zoom: 14, pitch: 40, bearing: 70 })
    await user.click(screen.getByRole('button', { name: 'Centre the map' }))
    expect(state).toMatchObject({
      zoom: 11.2,
      center: { lng: 12.565, lat: 55.68 },
      pitch: 0,
      bearing: 0,
      easing: undefined,
    })
  })

  it('hides the scale bar while the map is tilted, and shows it flat again, turned or not', () => {
    const { gesture } = open()
    expect(screen.getByText('Scale')).toBeInTheDocument()
    gesture({ pitch: 35, bearing: 40 })
    expect(mapCamera.get()).toMatchObject({ pitch: 35, bearing: 40 })
    expect(screen.queryByText('Scale')).not.toBeInTheDocument()
    gesture({ pitch: 0 })
    expect(mapCamera.get()).toMatchObject({ pitch: 0, bearing: 40 })
    expect(screen.getByText('Scale')).toBeInTheDocument()
  })
})

describe('the controls before the map attaches', () => {
  it('dim the zoom and the reset but keep the pause', async () => {
    const user = userEvent.setup()
    render(
      <Providers lang="en" dictionary={en}>
        <MapTools />
      </Providers>,
    )
    expect(screen.getByRole('button', { name: 'Zoom in' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Zoom out' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Centre the map' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    const pause = screen.getByRole('button', { name: 'Pause' })
    expect(pause).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(pause)
    expect(motionPause.get()).toBe(true)
  })
})

describe('the prerendered controls', () => {
  it('hydrate without a warning, before the map has attached', async () => {
    expect(mapCamera.get()).toBeUndefined()
    const tools = (
      <Providers lang="en" dictionary={en}>
        <MapTools />
      </Providers>
    )
    const page = document.createElement('div')
    page.innerHTML = renderToString(tools)
    document.body.append(page)
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    let root: ReturnType<typeof hydrateRoot> | undefined
    onTestFinished(() => {
      warn.mockRestore()
      act(() => root?.unmount())
      page.remove()
    })
    root = await act(async () => hydrateRoot(page, tools))
    expect(warn).not.toHaveBeenCalled()
    expect(within(page).getByText('—')).toBeInTheDocument()
  })
})

describe("the map's keys", () => {
  it('zoom with + and −, and pan with the arrows', async () => {
    const user = userEvent.setup()
    const { state } = open()
    await user.keyboard('+')
    expect(state.zoom).toBeCloseTo(12.2)
    await user.keyboard('-')
    await user.keyboard('-')
    expect(state.zoom).toBeCloseTo(10.2)
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowUp}')
    expect(state.panned).toEqual([200, -100])
    await user.keyboard('{ArrowLeft}{ArrowDown}{ArrowDown}')
    expect(state.panned).toEqual([100, 100])
  })

  it('tilt the map a step with Shift + ↑ and back with Shift + ↓, never past 60°', async () => {
    const user = userEvent.setup()
    const { state, settle } = open()
    const press = async (key: string) => {
      await user.keyboard(`{Shift>}{${key}}{/Shift}`)
      act(settle)
    }
    await press('ArrowUp')
    expect(state.pitch).toBe(10)
    await press('ArrowUp')
    expect(state.pitch).toBe(20)
    await press('ArrowDown')
    expect(state.pitch).toBe(10)
    for (let i = 0; i < 8; i++) await press('ArrowUp')
    expect(state.pitch).toBe(60)
    await press('ArrowDown')
    expect(state.pitch).toBe(50)
    // Tilting moves neither the centre nor the heading.
    expect(state.panned).toEqual([0, 0])
    expect(state.bearing).toBe(0)
  })

  it('turn the map a step either way with Shift + ← and →', async () => {
    const user = userEvent.setup()
    const { state, settle } = open()
    const press = async (key: string) => {
      await user.keyboard(`{Shift>}{${key}}{/Shift}`)
      act(settle)
    }
    await press('ArrowRight')
    expect(state.bearing).toBe(15)
    await press('ArrowRight')
    expect(state.bearing).toBe(30)
    for (let i = 0; i < 3; i++) await press('ArrowLeft')
    expect(state.bearing).toBe(-15)
    // Turning moves neither the centre nor the tilt.
    expect(state.panned).toEqual([0, 0])
    expect(state.pitch).toBe(0)
  })

  it('end Follow with a Shift + arrow press, as with any other key move', async () => {
    const user = userEvent.setup()
    const { map, container } = open()
    const follow = followCamera(map as unknown as FollowMap, container)
    onTestFinished(() => follow.remove())
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      act(() => followedVehicle.start('bus.5C.1'))
      await user.keyboard(`{Shift>}{${key}}{/Shift}`)
      expect(followedVehicle.get()).toBeUndefined()
    }
  })

  it('leave the arrows to the toolbar while the focus is in it', async () => {
    const user = userEvent.setup()
    const { state } = open()
    screen.getByRole('button', { name: 'Zoom in' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(state.panned).toEqual([0, 0])
    expect(screen.getByRole('button', { name: 'Zoom out' })).toHaveFocus()
  })

  it('close the card with Esc', async () => {
    const user = userEvent.setup()
    open()
    act(() => pickedVehicle.pick({ kind: 'trip', key: 'any', point: [0, 0] }))
    await user.keyboard('{Escape}')
    expect(pickedVehicle.get()).toBeUndefined()
  })
})
