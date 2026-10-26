'use client'

import info from '@mylder/perron/icons/info.svg'
import pause from '@mylder/perron/icons/pause.svg'
import play from '@mylder/perron/icons/play.svg'
import type { CSSProperties } from 'react'
import styles from './PerronIcon.module.css'

/** A file as the build hands it over: Next.js gives a static image, Vite its URL. */
type Asset = string | { readonly src: string }

const urlOf = (asset: Asset) => (typeof asset === 'string' ? asset : asset.src)

/** The icons from Perron's icons/ folder that the screens draw. */
const ICONS = { info, pause, play } satisfies Record<string, Asset>

export type PerronIconName = keyof typeof ICONS

/**
 * One of Perron's own icons, its file from `@mylder/perron/icons/` drawn in the text's colour at
 * Perron's icon size (`.perron-icon`), so Mylder never copies an icon's paths. It is decoration:
 * the control it sits in carries the name.
 */
export function PerronIcon({ name }: { name: PerronIconName }) {
  const style = { '--mylder-icon': `url("${urlOf(ICONS[name])}")` } as CSSProperties
  return <span className={`perron-icon ${styles.icon}`} style={style} aria-hidden="true" />
}
