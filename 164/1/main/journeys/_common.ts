import type { Page } from '@playwright/test'
export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const scaleBar = (page: Page) => page.getByText(/\d+\s(m|km)$/)
export const toolbar = (page: Page) => page.getByRole('toolbar').first()
export const mapEl = (page: Page) => page.locator('[data-vehicles]')
export const region = (page: Page) => page.getByRole('region', { name: /Copenhagen|København/ })
/** Every button in the map controls, by accessible name, with aria-pressed. */
export const controlNames = (page: Page) =>
  toolbar(page).evaluate((bar) =>
    [...bar.querySelectorAll('button')].map((b) => ({
      name: (b.getAttribute('aria-label') ?? b.textContent ?? '').trim(),
      pressed: b.getAttribute('aria-pressed'),
      tabindex: b.getAttribute('tabindex'),
      description: b.getAttribute('aria-description') ?? b.getAttribute('aria-describedby'),
      title: b.getAttribute('title'),
    })),
  )
export async function keys(page: Page, key: string, n: number) {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(key)
    await pause(450)
  }
}
/** Rotations (deg) of every transformed element inside an element. */
export const rotations = (page: Page, sel: ReturnType<Page['locator']>) =>
  sel.evaluate((el) =>
    [el, ...el.querySelectorAll('*')]
      .map((n) => {
        const t = getComputedStyle(n as Element).transform
        const attr = (n as Element).getAttribute('transform')
        if (t && t !== 'none') {
          const m = new DOMMatrix(t)
          return { tag: (n as Element).tagName, deg: Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI) }
        }
        if (attr) return { tag: (n as Element).tagName, attr }
        return null
      })
      .filter(Boolean),
  )
