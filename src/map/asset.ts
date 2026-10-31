// A file imported as an asset, such as one of Perron's icons, and its URL, for the map's glyphs
// and the screens' icons alike.
import 'client-only'

/** A file as the build hands it over: Next.js gives a static image, Vite its URL. */
export type Asset = string | { readonly src: string }

/** Where the build serves `asset`. */
export const urlOf = (asset: Asset): string => (typeof asset === 'string' ? asset : asset.src)
