'use client'

import { Brand, Text } from '@mylder/perron'
import styles from './Home.module.css'

/** The shell's one screen until the map arrives: the brand, and what Mylder is. */
export function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        {/* oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label -- Brand fills the link with its name */}
        <Brand render={<a href="/" />} />
      </header>
      <main className={styles.main}>
        {/* oxlint-disable-next-line jsx-a11y/heading-has-content -- Text fills the heading */}
        <Text variant="display" render={<h1 />}>
          Watch Copenhagen move.
        </Text>
        <Text emphasis="secondary">
          A live map of Copenhagen's buses, S-tog, metro and trains, honest about how fresh each
          position is. The map comes next.
        </Text>
      </main>
    </div>
  )
}
