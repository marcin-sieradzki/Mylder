'use client'

import { Brand, Text } from '@mylder/perron'
import { useI18n } from '../i18n/useI18n'
import styles from './Home.module.css'
import { LanguageSwitch } from './LanguageSwitch'

/** The shell's one screen until the map arrives: the brand, what Mylder is, and the language. */
export function Home() {
  const { lang, dictionary } = useI18n()
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        {/* oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label -- Brand fills the link with its name */}
        <Brand render={<a href={`/${lang}`} />} />
        <LanguageSwitch />
      </header>
      <main className={styles.main}>
        {/* oxlint-disable-next-line jsx-a11y/heading-has-content -- Text fills the heading */}
        <Text variant="display" render={<h1 />}>
          {dictionary.home.heading}
        </Text>
        <Text emphasis="secondary">{dictionary.home.intro}</Text>
      </main>
    </div>
  )
}
