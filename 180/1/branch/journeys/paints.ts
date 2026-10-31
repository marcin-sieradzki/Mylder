// Records every paint of a linked stop's panel (the stop-panel feature's "First paint" recipe).
// Each mutation and each animation frame pushes the text of every row of the stop dialog's named lists,
// and the stop dialog's whole text, onto window.__paints, with the moment it was seen.
import type { Page } from '@playwright/test'

export const record = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __paints: { t: number; via: string; dialogs: { name: string; text: string; lists: { label: string; rows: string[] }[] }[] }[] }
    w.__paints = []
    let last = ''
    const grab = (via: string) => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')]
        .map((d) => ({
          name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') ? document.getElementById(d.getAttribute('aria-labelledby')!.split(' ')[0])?.textContent || '' : ''),
          text: (d as HTMLElement).innerText ?? d.textContent ?? '',
          lists: [...d.querySelectorAll('ul[aria-label]')].map((u) => ({
            label: u.getAttribute('aria-label') || '',
            rows: [...u.querySelectorAll('li')].map((li) => (li as HTMLElement).innerText ?? li.textContent ?? ''),
          })),
        }))
        .filter((d) => d.name !== 'Overview' && d.name !== 'Oversigt')
      const key = JSON.stringify(dialogs)
      if (key === last) return
      last = key
      w.__paints.push({ t: performance.now(), via, dialogs })
    }
    new MutationObserver(() => grab('mutation')).observe(document, { subtree: true, childList: true, characterData: true, attributes: true })
    const frame = () => { grab('frame'); requestAnimationFrame(frame) }
    requestAnimationFrame(frame)
  })

export type Paint = { t: number; via: string; dialogs: { name: string; text: string; lists: { label: string; rows: string[] }[] }[] }
export const paints = (page: Page) => page.evaluate(() => (window as unknown as { __paints: Paint[] }).__paints)

const LISTS = /^(Departures|Arrivals|At the platforms now|Standing.*|Afgange|Ankomster)$/
// A row's identity without its countdown, so a row seen early can be matched to the same row settled.
const ident = (row: string) => row.replace(/\bNow\b|\b\d+\s*min\b|—|\bUnknown\b/g, '').replace(/\s+/g, ' ').trim()
export const nowWord = /\bNow\b/

// Rows that read "Now" in some paint although the same row, settled, does not read "Now".
export const falseNows = (all: Paint[], settled: Paint) => {
  const settledNow = new Set<string>()
  for (const d of settled.dialogs) for (const l of d.lists) if (LISTS.test(l.label)) for (const r of l.rows) if (nowWord.test(r)) settledNow.add(ident(r))
  const bad: { t: number; list: string; row: string }[] = []
  for (const p of all) for (const d of p.dialogs) for (const l of d.lists) if (LISTS.test(l.label))
    for (const r of l.rows) if (nowWord.test(r) && !settledNow.has(ident(r))) bad.push({ t: p.t, list: l.label, row: r.replace(/\n/g, ' | ') })
  return bad
}
export const outOfDate = (all: Paint[]) =>
  all.flatMap((p) => p.dialogs.filter((d) => /may be out of date/i.test(d.text)).map((d) => ({ t: p.t, dialog: d.name, text: d.text.replace(/\n/g, ' | ').slice(-300) })))

export const summary = (all: Paint[]) =>
  all.map((p) => `${p.t.toFixed(0)}ms ${p.via}: ` + p.dialogs.map((d) => `[${d.name}] ` + d.lists.map((l) => `${l.label}{ ${l.rows.slice(0, 3).map((r) => r.replace(/\n/g, ' | ')).join(' // ')} }`).join(' ')).join(' ')).join('\n')
