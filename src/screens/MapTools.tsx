'use client'

import { MapControls } from '@mylder/perron'
import { ScaleBar } from '@mylder/perron/patterns'
import { useEffect } from 'react'
import { mapCamera, useCameraView, type CameraView } from '../map/camera'
import { listenForMapKeys } from '../map/keys'
import { motionPause, useMotionPaused } from '../map/pause'
import styles from './MapTools.module.css'

const zoomIn = () => mapCamera.zoomIn()
const zoomOut = () => mapCamera.zoomOut()
const reset = () => mapCamera.reset()
const setPaused = (_event: unknown, paused: boolean) => motionPause.set(paused)

const attached = (view: CameraView | undefined) => view !== undefined
const closest = (view: CameraView | undefined) => view?.closest ?? false
const farthest = (view: CameraView | undefined) => view?.farthest ?? false
/** Tilted, the map has no one scale: the ground at its foot is drawn bigger than at its top. */
const tilted = (view: CameraView | undefined) => (view?.pitch ?? 0) > 0
/**
 * The ground a pixel spans, to three figures, finer than the bar can show: a camera Follow moves
 * each frame changes it in the eighth figure, which needn't draw the bar again. None before the
 * map attaches, which the bar shows as unknown.
 */
const metersPerPixel = (view: CameraView | undefined) =>
  view ? Number(view.metersPerPixel.toPrecision(3)) : 0

/** The scale bar, on its own: it reads the ground a pixel spans, which moves with every pan. */
function MapScale() {
  return <ScaleBar metersPerPixel={useCameraView(metersPerPixel)} />
}

/**
 * The map's controls (docs/screens.md, "The moving map"): zoom in, zoom out, reset view and the
 * pause that stops the dots moving, with the scale bar beside them while the map is flat, and the
 * map's keys. Until the
 * map attaches the zoom and reset buttons are dimmed but the pause is not: a pause pressed then
 * holds once the dots draw. MapControls' `disabled` would dim the pause too, so the bar dims each
 * of the others on its own.
 */
export function MapTools() {
  const hasMap = useCameraView(attached)
  const atClosest = useCameraView(closest)
  const atFarthest = useCameraView(farthest)
  const isTilted = useCameraView(tilted)
  const paused = useMotionPaused()
  useEffect(() => listenForMapKeys(), [])
  return (
    <div className={styles.tools}>
      {isTilted ? null : <MapScale />}
      <MapControls
        zoomInDisabled={!hasMap || atClosest}
        zoomOutDisabled={!hasMap || atFarthest}
        centerMapDisabled={!hasMap}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onCenterMap={reset}
        paused={paused}
        onPausedChange={setPaused}
      />
    </div>
  )
}
