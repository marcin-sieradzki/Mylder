'use client'

import { Button } from '@mylder/perron'
import { followedVehicle, useFollowed } from '../map/follow'
import { mapHighlight, patternHighlight } from '../map/highlight'
import { useI18n } from '../i18n/useI18n'
import type { Network } from '../timetable/network'

export interface VehicleActionsProps {
  /** The trip's key. */
  tripKey: string
  /** The trip's pattern, as its answer or the snapshot gives it. */
  pattern: number | undefined
  /** Whether the trip's dot is on the map now, which Follow needs. */
  onMap: boolean
  /** The timetable's network, whose path Show whole line draws; none until it has loaded. */
  network: Network | undefined
}

/**
 * Vehicle detail's actions (docs/screens.md, "Vehicle detail"): Follow, pressed while the camera
 * keeps to the dot, and Show whole line, which highlights the trip's pattern on the map and ends
 * Follow, since the camera moves to the line.
 */
export function VehicleActions({ tripKey, pattern, onMap, network }: VehicleActionsProps) {
  const { dictionary } = useI18n()
  const words = dictionary.trip
  const following = useFollowed() === tripKey
  const line = network && pattern !== undefined ? network.patterns.patterns[pattern] : undefined
  return (
    <>
      <Button
        variant="outline"
        size="small"
        selected={following}
        disabled={!onMap}
        onClick={() => (following ? followedVehicle.stop() : followedVehicle.start(tripKey))}
      >
        {words.follow}
      </Button>
      <Button
        variant="outline"
        size="small"
        disabled={!line}
        onClick={() => {
          if (!network || pattern === undefined) return
          followedVehicle.stop()
          mapHighlight.show(patternHighlight(network, pattern))
        }}
      >
        {words.showLine}
      </Button>
    </>
  )
}
