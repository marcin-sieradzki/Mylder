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
/**
 * The ground a pixel spans, to three figures, finer than the bar can show: a camera Follow moves
 * each frame changes it in the eighth figure, which needn't draw the bar again.
 */
const metersPerPixel = (view: CameraView | undefined) =>
  view ? Number(view.metersPerPixel.toPrecision(3)) : Number.NaN

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
        {/* Perron has no pause icon yet, so the pause says its word. */}
        <Toolbar aria-label={dictionary.controls.motion}>
          <ToolbarButton color="neutral" onClick={togglePause}>
            {paused ? dictionary.controls.resume : dictionary.controls.pause}
          </ToolbarButton>
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
