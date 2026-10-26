'use client'

import { MapControls, Toolbar, ToolbarButton } from '@mylder/perron'
import { ScaleBar } from '@mylder/perron/patterns'
import { useEffect } from 'react'
import { useI18n } from '../i18n/useI18n'
import { mapCamera, useCameraView, type CameraView } from '../map/camera'
import { listenForMapKeys } from '../map/keys'
import { motionPause, useMotionPaused } from '../map/pause'
import styles from './MapTools.module.css'

const zoomIn = () => mapCamera.zoomIn()
const zoomOut = () => mapCamera.zoomOut()
const reset = () => mapCamera.reset()
const togglePause = () => motionPause.toggle()

const attached = (view: CameraView | undefined) => view !== undefined
const closest = (view: CameraView | undefined) => view?.closest ?? false
const farthest = (view: CameraView | undefined) => view?.farthest ?? false
const metersPerPixel = (view: CameraView | undefined) => view?.metersPerPixel ?? Number.NaN

/** The attributes Perron's 16 px icons share, from its icons/ folder. */
const STROKE = {
  className: 'perron-icon',
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** Perron's `pause`: stop the vehicles moving on the map. */
const PAUSE_ICON = (
  <svg {...STROKE} strokeWidth="1.8">
    <path d="M5.75 3.5v9M10.25 3.5v9" />
  </svg>
)

/** Perron's `play`: set the vehicles moving again. */
const PLAY_ICON = (
  <svg {...STROKE} strokeWidth="1.6">
    <path d="M5 3.4v9.2a.5.5 0 0 0 .76.43l7.4-4.6a.5.5 0 0 0 0-.86l-7.4-4.6A.5.5 0 0 0 5 3.4z" />
  </svg>
)

/** The scale bar, on its own: it reads the ground a pixel spans, which moves with every pan. */
function MapScale() {
  return <ScaleBar metersPerPixel={useCameraView(metersPerPixel)} />
}

/**
 * The map's controls (docs/screens.md, "The moving map"): zoom in, zoom out, reset view and the
 * pause that stops the dots moving, with the scale bar beside them, and the map's keys.
 */
export function MapTools() {
  const { dictionary } = useI18n()
  const hasMap = useCameraView(attached)
  const atClosest = useCameraView(closest)
  const atFarthest = useCameraView(farthest)
  const paused = useMotionPaused()
  useEffect(() => listenForMapKeys(), [])
  return (
    <div className={styles.tools}>
      <MapScale />
      <div className={styles.buttons}>
        {/* MapControls holds only its own three buttons, so the pause has a bar of its own. */}
        <Toolbar aria-label={dictionary.controls.motion}>
          <ToolbarButton
            color="neutral"
            startIcon={paused ? PLAY_ICON : PAUSE_ICON}
            aria-label={paused ? dictionary.controls.resume : dictionary.controls.pause}
            onClick={togglePause}
          />
        </Toolbar>
        <MapControls
          disabled={!hasMap}
          zoomInDisabled={atClosest}
          zoomOutDisabled={atFarthest}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onCenterMap={reset}
        />
      </div>
    </div>
  )
}
