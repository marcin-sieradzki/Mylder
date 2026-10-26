'use client'

import { Button } from '@mylder/perron'
import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { CitySheet } from './CitySheet'
import { MapFoot } from './MapFoot'
import styles from './MapScreen.module.css'
import { TopBar } from './TopBar'
import { VehicleCard } from './VehicleCard'

// MapLibre needs the browser's window, so the map loads on the client only.
const BaseMap = dynamic(() => import('../map/BaseMap'), { ssr: false })

/**
 * The moving map (docs/screens.md): the map fills the window, with the top bar over it, the
 * legend, the controls and the credit at its foot, the sheet beside it, and the picked dot's card.
 * The sheet starts open; closed, a button at the foot opens it again.
 */
export function MapScreen() {
  const { dictionary } = useI18n()
  const [sheet, setSheet] = useState<'open' | 'closed' | 'reopened'>('open')
  const opener = useRef<HTMLButtonElement>(null)
  const open = sheet !== 'closed'
  return (
    <div className={styles.screen}>
      <main className={styles.map}>
        <BaseMap label={dictionary.map.label} className={styles.canvas} />
      </main>
      <TopBar />
      <MapFoot
        besideSheet={open}
        opener={
          open ? null : (
            <Button ref={opener} onClick={() => setSheet('reopened')}>
              {dictionary.sheet.title}
            </Button>
          )
        }
      />
      <CitySheet
        open={open}
        onClose={() => setSheet('closed')}
        asked={sheet === 'reopened'}
        opener={opener}
      />
      <VehicleCard />
    </div>
  )
}
