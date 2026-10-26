'use client'

import { MapControls, Toolbar, ToolbarButton } from '@mylder/perron'
import { ScaleBar } from '@mylder/perron/patterns'
import { useEffect } from 'react'
import { useI18n } from '../i18n/useI18n'
import { mapCamera, useCameraView } from '../map/camera'
import { listenForMapKeys } from '../map/keys'
import { motionPause, useMotionPaused } from '../map/pause'
import styles from './MapTools.module.css'

const zoomIn = () => mapCamera.zoomIn()
const zoomOut = () => mapCamera.zoomOut()
const reset = () => mapCamera.reset()
const togglePause = () => motionPause.toggle()

/**
 * The map's controls (docs/screens.md, "The moving map"): zoom in, zoom out, reset view and the
 * pause that stops the dots moving, with the scale bar beside them, and the map's keys.
 */
export function MapTools() {
  const { dictionary } = useI18n()
  const view = useCameraView()
  const paused = useMotionPaused()
  useEffect(() => listenForMapKeys(), [])
  return (
    <div className={styles.tools}>
      <ScaleBar metersPerPixel={view?.metersPerPixel ?? Number.NaN} className={styles.scale} />
      <div className={styles.buttons}>
        {/* Perron has no pause icon yet, so the pause says its word. */}
        <Toolbar aria-label={dictionary.controls.motion}>
          <ToolbarButton color="neutral" onClick={togglePause}>
            {paused ? dictionary.controls.resume : dictionary.controls.pause}
          </ToolbarButton>
        </Toolbar>
        <MapControls
          disabled={!view}
          zoomInDisabled={view?.closest}
          zoomOutDisabled={view?.farthest}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onCenterMap={reset}
        />
      </div>
    </div>
  )
}
