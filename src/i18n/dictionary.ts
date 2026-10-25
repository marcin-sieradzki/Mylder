import type en from './en.json'

/** Every word on the page, keyed by where it shows. English is the source; Danish has every key. */
export type Dictionary = typeof en

/** The words the client tree needs: every key but the page's metadata, which the server sets. */
export type ClientDictionary = Omit<Dictionary, 'meta'>
