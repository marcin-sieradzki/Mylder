import '@mylder/perron/tokens.css'
import { afterEach, describe, expect, it } from 'vitest'
import { readPaint, watchTheme } from './paint.ts'

const root = document.documentElement

afterEach(() => {
  delete root.dataset.theme
})

describe("Perron's paint", () => {
  it("reads a token's value, following one that refers to another", () => {
    const paint = readPaint(root, ['perron-color-map-land', 'perron-color-transit-mode-bus'])
    expect(paint.get('perron-color-map-land')).toBe('#EDEFEB')
    // `var(--perron-palette-yellow-500)` in light.
    expect(paint.get('perron-color-transit-mode-bus')).toBe('#D99A00')
  })

  it('keeps the values it read, and reads the new theme when told it changed', async () => {
    const before = readPaint(root, ['perron-color-map-land'])
    const changed = new Promise<string | undefined>((resolve) => {
      const stop = watchTheme(root, () => {
        stop()
        resolve(readPaint(root, ['perron-color-map-land']).get('perron-color-map-land'))
      })
    })
    root.dataset.theme = 'dark'
    expect(await changed).toBe('#151B1E')
    expect(before.get('perron-color-map-land')).toBe('#EDEFEB')
  })
})
