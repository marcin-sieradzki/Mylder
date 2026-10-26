'use client'

import dynamic from 'next/dynamic'
import { useI18n } from '../i18n/useI18n'
import { MapFoot } from './MapFoot'
import styles from './MapScreen.module.css'
import { TopBar } from './TopBar'
import { VehicleCard } from './VehicleCard'

// MapLibre needs the browser's window, so the map loads on the client only.
const BaseMap = dynamic(() => import('../map/BaseMap'), { ssr: false })

/**
 * The moving map (docs/screens.md): the map fills the window, with the top bar over it, the
 * legend, the controls and the credit at its foot, and the picked dot's card.
 */
export function MapScreen() {
  const { dictionary } = useI18n()
  return (
    <div className={styles.screen}>
      <main className={styles.map}>
        <BaseMap label={dictionary.map.label} className={styles.canvas} />
      </main>
      <TopBar />
      <MapFoot />
      <VehicleCard />
    </div>
  )
}
