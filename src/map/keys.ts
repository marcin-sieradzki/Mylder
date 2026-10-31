// The map's keys (docs/screens.md, "Accessibility"): + and − zoom, the arrows pan, Shift + ← and
// → turn the map and Shift + ↑ and ↓ tilt it, Esc closes the card. The map takes + and − and the arrows only while the focus is on the page itself or
// on the map, so the arrows still move through a toolbar and type in a field. MapLibre's own
// keys are off, so a press on the map moves it once.
import 'client-only'
import { mapCamera, type Camera } from './camera.ts'
import { pickedVehicle, type PickedStore } from './picking.ts'

type Move = (camera: Camera, input: KeyboardEvent) => void

const MOVES: Record<string, Move> = {
  '+': (camera) => camera.zoomIn(),
  '=': (camera) => camera.zoomIn(),
  '-': (camera) => camera.zoomOut(),
  '−': (camera) => camera.zoomOut(),
  ArrowLeft: (camera, input) => camera.pan(-1, 0, input),
  ArrowRight: (camera, input) => camera.pan(1, 0, input),
  ArrowUp: (camera, input) => camera.pan(0, -1, input),
  ArrowDown: (camera, input) => camera.pan(0, 1, input),
}

/** With Shift, the arrows turn and tilt the map instead. */
const SHIFTED: Record<string, Move> = {
  ArrowLeft: (camera, input) => camera.turn(-1, input),
  ArrowRight: (camera, input) => camera.turn(1, input),
  ArrowUp: (camera, input) => camera.tilt(1, input),
  ArrowDown: (camera, input) => camera.tilt(-1, input),
}

/** Whether the focus is on the page itself rather than on a control. */
const onPage = (target: EventTarget | null) =>
  target === null || target === document.body || target === document.documentElement

/**
 * Listens on `document` for the map's keys, moving `camera` and closing the card in `picked`.
 * Returns the function that stops it.
 */
export function listenForMapKeys(
  camera: Camera = mapCamera,
  picked: PickedStore = pickedVehicle,
): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'Escape') {
      picked.clear()
      return
    }
    // + is a shifted key on many keyboards, so Shift changes only what the arrows do.
    const move = (event.shiftKey ? SHIFTED[event.key] : undefined) ?? MOVES[event.key]
    const target = event.target
    if (!move || !(onPage(target) || (target instanceof Element && camera.holds(target)))) return
    event.preventDefault()
    move(camera, event)
  }
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
}
