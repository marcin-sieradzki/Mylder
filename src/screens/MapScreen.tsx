'use client'

import { Brand, Surface } from '@mylder/perron'
import dynamic from 'next/dynamic'
import { useI18n } from '../i18n/useI18n'
import { LanguageSwitch } from './LanguageSwitch'
import styles from './MapScreen.module.css'

// MapLibre needs the browser's window, so the map loads on the client only.
const BaseMap = dynamic(() => import('../map/BaseMap'), { ssr: false })

/**
 * The moving map (docs/screens.md): the map fills the window, with the brand and the language
 * switch floating over it until the top bar arrives.
 */
export function MapScreen() {
  const { lang, dictionary } = useI18n()
  return (
    <div className={styles.screen}>
      <main className={styles.map}>
        <BaseMap label={dictionary.map.label} className={styles.canvas} />
      </main>
      <Surface variant="glass" render={<header />} className={styles.bar}>
        {/* oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label -- Brand fills the link with its name */}
        <Brand render={<a href={`/${lang}`} />} />
        <LanguageSwitch />
      </Surface>
    </div>
  )
}
