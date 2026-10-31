// The map's one frame driver: it owns the animation frames and the stillness of everything that
// moves on the canvas, the vehicles (loop.ts) and the aircraft (aircraft-loop.ts). Each frame it
// has every kind place its things where they are now, then renders once, so the canvas gets one
// render a frame however many kinds move. Frames run while any kind has something moving.
// Under the system's reduced motion setting, or while the pause control holds, it runs no frames
// of motion: each kind stands its things where they are and steps them to their new places once
// per snapshot, and a render asked for still comes in the next frame.
import 'client-only'
import { motionPause, type MotionPause } from './pause.ts'

/** The part of a `MediaQueryList` the driver reads. */
export interface MediaSetting {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

/** One kind's moving things, as the driver ticks them. */
export interface Movers {
  /** Whether any of them moves now: the frames run on while one kind's does. */
  moving(): boolean
  /** Places each where its motion has it now; once a frame, while the motion isn't stilled. */
  frame(): void
  /**
   * Hears the motion stilled, to stand each where it is now, or moving again, to go on from
   * where each stands.
   */
  stillness(stilled: boolean): void
}

export interface FrameOptions {
  /** Draws every kind where it was last placed: once a frame. */
  render(): void
  pause?: MotionPause
  /** The system's reduced-motion setting; none where the browser has no media queries. */
  reducedMotion?: MediaSetting | null
}

export interface FrameDriver {
  /** Whether the motion is stilled: paused, or the system asks for reduced motion. */
  still(): boolean
  /** Ticks a kind's movers each frame; returns the function that stops. */
  drive(movers: Movers): () => void
  /**
   * Asks for a render in the next frame, after something was placed or changed, and for frames
   * on from there while anything moves.
   */
  request(): void
  stop(): void
}

const systemReducedMotion = (): MediaSetting | null =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

/** A driver that runs frames while there is something to move and the motion isn't stilled. */
export function frameDriver({
  render,
  pause = motionPause,
  reducedMotion = systemReducedMotion(),
}: FrameOptions): FrameDriver {
  const kinds = new Set<Movers>()
  let frame: number | undefined
  const still = () => pause.get() || Boolean(reducedMotion?.matches)
  const moving = () => !still() && [...kinds].some((kind) => kind.moving())

  // The next frame is asked for first, so a frame that fails leaves the frames running.
  const run = () => {
    frame = moving() ? requestAnimationFrame(run) : undefined
    if (!still()) for (const kind of kinds) kind.frame()
    render()
  }
  const request = () => {
    frame ??= requestAnimationFrame(run)
  }

  const onStillness = () => {
    const stilled = still()
    for (const kind of kinds) kind.stillness(stilled)
    request()
  }
  const stopPause = pause.subscribe(onStillness)
  reducedMotion?.addEventListener('change', onStillness)

  return {
    still,
    drive(movers) {
      kinds.add(movers)
      return () => kinds.delete(movers)
    },
    request,
    stop() {
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
      kinds.clear()
      stopPause()
      reducedMotion?.removeEventListener('change', onStillness)
    },
  }
}
