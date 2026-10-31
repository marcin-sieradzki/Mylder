// Records every text København Syd St.'s source line takes, and when: a MutationObserver
// (every DOM change, however brief) plus a per-frame sampler, both from an init script.
// Also logs the board's requests and answers with the browser's wall clock.
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

export type Seen = { t: number; wall: number; via: string; line: string; warn: boolean }

export const record = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __seen: Seen[] }
    type Seen = { t: number; wall: number; via: string; line: string; warn: boolean }
    w.__seen = []
    let last = '\u0000'
    const grab = (via: string) => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => /København Syd St\./.test(x.getAttribute('aria-label') || document.getElementById((x.getAttribute('aria-labelledby') || '').split(' ')[0] || '')?.textContent || ''))
      let line = '(no panel)'
      let warn = false
      if (d) {
        const text = (d as HTMLElement).textContent || ''
        warn = /may be out of date/i.test(text)
        const m = text.match(/Rejseplanen[^]{0,6}?(departures|arrivals)[^]{0,4}?\d\d:\d\d(:\d\d)?(, may be out of date)?/)
        line = m ? m[0].replace(/\s+/g, ' ') : '(no source line)'
        if (warn && !m) line = '(warn elsewhere) ' + text.slice(text.search(/may be out of date/i) - 80, text.search(/may be out of date/i) + 20)
      }
      const key = line + '|' + warn
      if (key === last) return
      last = key
      w.__seen.push({ t: performance.now(), wall: Date.now(), via, line, warn })
    }
    new MutationObserver(() => grab('mutation')).observe(document, { subtree: true, childList: true, characterData: true, attributes: true })
    const frame = () => { grab('frame'); requestAnimationFrame(frame) }
    requestAnimationFrame(frame)
  })

export const seen = (page: Page) => page.evaluate(() => (window as unknown as { __seen: Seen[] }).__seen)

// The board's requests: when asked and when answered, by the Node wall clock.
export const boardLog = (page: Page) => {
  const log: string[] = []
  const t0 = Date.now()
  const rel = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6)
  page.on('request', (r) => { if (/\/api\/stops\//.test(r.url())) log.push(`${rel()}s ${new Date().toISOString()} ask ${r.url().replace(/^https?:\/\/[^/]+/, '')}`) })
  page.on('response', (r) => { if (/\/api\/stops\//.test(r.url())) log.push(`${rel()}s ${new Date().toISOString()} answer ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`) })
  page.on('requestfailed', (r) => { if (/\/api\/stops\//.test(r.url())) log.push(`${rel()}s ${new Date().toISOString()} failed ${r.failure()?.errorText} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`) })
  return log
}

// The recording's clock now, from the run's launch time (07:20:00 at launch, real time after).
export const recClock = (run: string, wall = Date.now()) => {
  const started = Number(readFileSync(`.verify/${run}/started`, 'utf8').trim()) * 1000
  const s = Math.floor((wall - started) / 1000) + 7 * 3600 + 20 * 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`
}

export const fmt = (all: Seen[], run: string) => {
  const t0 = all[0]?.t ?? 0
  return all.map((s) => `${((s.t - t0) / 1000).toFixed(3).padStart(8)}s rec~${recClock(run, s.wall)} ${s.via.padEnd(8)} ${s.warn ? 'WARN ' : '     '}${s.line}`).join('\n')
}

// How long each text stayed: the gap from one change to the next.
export const durations = (all: Seen[], endT: number) =>
  all.map((s, i) => ({ ...s, ms: (all[i + 1]?.t ?? endT) - s.t }))
