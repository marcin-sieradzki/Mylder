import 'server-only'
import type { Dictionary } from './dictionary'
import type { Lang } from './lang'

const dictionaries = {
  en: () => import('./en.json').then((module) => module.default),
  da: () => import('./da.json').then((module) => module.default),
} satisfies Record<Lang, () => Promise<Dictionary>>

/** Loads a language's dictionary on the server, to hand to the client tree. */
export function getDictionary(lang: Lang): Promise<Dictionary> {
  return dictionaries[lang]()
}
