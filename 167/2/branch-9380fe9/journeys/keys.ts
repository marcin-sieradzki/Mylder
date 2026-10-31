import type { Page } from '@playwright/test'

// Trusted key events sent straight to Chromium without waiting for the page to handle each one,
// as a rider's quick presses arrive while a slow renderer is still drawing the last frame.
const KEYS = {
  Shift: { key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
} as const
type Key = keyof typeof KEYS

export async function keyboard(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type: 'rawKeyDown' | 'keyUp', key: Key, autoRepeat = false) =>
    cdp.send('Input.dispatchKeyEvent', { type, modifiers: 8, autoRepeat, ...KEYS[key] })
  return {
    /** Shift + key pressed `times` times, `gapMs` apart, without waiting for the page. */
    async quick(key: Key, times: number, gapMs: number) {
      const sent: Promise<unknown>[] = [send('rawKeyDown', 'Shift')]
      for (let i = 0; i < times; i++) {
        sent.push(send('rawKeyDown', key), send('keyUp', key))
        if (gapMs) await new Promise((r) => setTimeout(r, gapMs))
      }
      sent.push(send('keyUp', 'Shift'))
      await Promise.all(sent)
    },
    /** Shift + key held for `ms`, repeating every `everyMs` as a keyboard's auto-repeat does. */
    async hold(key: Key, ms: number, everyMs: number, onRelease: () => void) {
      const sent: Promise<unknown>[] = [send('rawKeyDown', 'Shift'), send('rawKeyDown', key)]
      const t0 = Date.now()
      let n = 1
      while (Date.now() - t0 < ms) {
        await new Promise((r) => setTimeout(r, everyMs))
        sent.push(send('rawKeyDown', key, true))
        n++
      }
      sent.push(send('keyUp', key), send('keyUp', 'Shift'))
      onRelease()
      await Promise.all(sent)
      return n
    },
  }
}
