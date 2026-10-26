import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import pauseFile from '@mylder/perron/icons/pause.svg'
import playFile from '@mylder/perron/icons/play.svg'
import { afterEach, describe, expect, it } from 'vitest'
import da from '../i18n/da.json'
import en from '../i18n/en.json'
import type { Lang } from '../i18n/lang'
import { mapCamera, type CameraMap } from '../map/camera'
import { motionPause } from '../map/pause'
import { pickedVehicle } from '../map/picking'
import { MapTools } from './MapTools'
import { Providers } from './Providers'

/**
 * MapLibre's map, which needs WebGL that jsdom lacks: a camera that moves at once, as MapLibre
 * does under reduced motion, between zoom 6 and 18. Its pans are in pixels at the centre.
 */
/** The file of the Perron icon a button draws, which the icon takes as its mask. */
const iconOf = (button: HTMLElement) =>
  button.querySelector<HTMLElement>('.perron-icon')?.style.getPropertyValue('--mylder-icon')

function fakeMap() {
  const container = document.createElement('div')
  document.body.append(container)
  const listeners = new Set<() => void>()
  const state = { zoom: 11.2, center: { lng: 12.565, lat: 55.68 }, panned: [0, 0] }
  const moved = () => {
    for (const listener of listeners) listener()
  }
  const map = {
    getZoom: () => state.zoom,
    getMinZoom: () => 6,
    getMaxZoom: () => 18,
    getCenter: () => state.center,
    getContainer: () => container,
    zoomIn: () => {
      state.zoom = Math.min(18, state.zoom + 1)
      moved()
    },
    zoomOut: () => {
      state.zoom = Math.max(6, state.zoom - 1)
      moved()
    },
    panBy: ([x, y]: [number, number]) => {
      state.panned = [state.panned[0] + x, state.panned[1] + y]
      moved()
    },
    easeTo: ({ center, zoom }: { center: [number, number]; zoom: number }) => {
      state.zoom = zoom
      state.center = { lng: center[0], lat: center[1] }
      state.panned = [0, 0]
      moved()
    },
    on: (_: string, listener: () => void) => listeners.add(listener),
    off: (_: string, listener: () => void) => listeners.delete(listener),
  }
  return { map: map as unknown as CameraMap, state, container }
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
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    for (const button of screen.getAllByRole('button')) expect(button).toHaveAccessibleName()
    expect(screen.getByText('Scale')).toBeInTheDocument()
  })

  it('gives every control a name, in Danish', () => {
    open('da')
    const controls = screen.getByRole('toolbar', { name: 'Kortknapper' })
    expect(within(controls).getByRole('button', { name: 'Zoom ind' })).toBeInTheDocument()
    expect(within(controls).getByRole('button', { name: 'Zoom ud' })).toBeInTheDocument()
    expect(within(controls).getByRole('button', { name: 'Centrér kortet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    for (const button of screen.getAllByRole('button')) expect(button).toHaveAccessibleName()
  })

  it('zooms, resets the view, and pauses and resumes the motion', async () => {
    const user = userEvent.setup()
    const { state } = open()
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(state.zoom).toBeCloseTo(13.2)
    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(state.zoom).toBeCloseTo(12.2)
    await user.click(screen.getByRole('button', { name: 'Centre the map' }))
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
    expect(iconOf(pause)).toBe(`url("${pauseFile}")`)
    await user.click(pause)
    const resume = screen.getByRole('button', { name: 'Fortsæt' })
    expect(resume).not.toHaveTextContent(/\S/)
    expect(iconOf(resume)).toBe(`url("${playFile}")`)
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
    act(() => pickedVehicle.pick({ key: 'any', point: [0, 0] }))
    await user.keyboard('{Escape}')
    expect(pickedVehicle.get()).toBeUndefined()
  })
})
