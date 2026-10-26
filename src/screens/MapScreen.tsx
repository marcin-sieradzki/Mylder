'use client'

import dynamic from 'next/dynamic'
import { useI18n } from '../i18n/useI18n'
import styles from './MapScreen.module.css'
import { PageNotices } from './PageNotices'
import { TopBar } from './TopBar'

// MapLibre needs the browser's window, so the map loads on the client only.
const BaseMap = dynamic(() => import('../map/BaseMap'), { ssr: false })

/** The moving map (docs/screens.md): the map fills the window, with the top bar over it. */
export function MapScreen() {
  const { dictionary } = useI18n()
  return (
    <div className={styles.screen}>
      <main className={styles.map}>
        <BaseMap label={dictionary.map.label} className={styles.canvas} />
      </main>
      <div className={styles.top}>
        <TopBar />
        <PageNotices />
      </div>
    </div>
  )
}
