import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// From the repo's root, where the tests run.
const read = (path: string) => readFileSync(path, 'utf8')

const icon = read('app/icon.svg')
const [light, dark] = ['mylder-mark.svg', 'mylder-mark-dark.svg'].map((file) =>
  read(`node_modules/@mylder/perron/logos/${file}`),
)

const shapes = (svg: string) => svg.match(/c[xy]="[\d.]+" c[xy]="[\d.]+" r="[\d.]+"/g)
const colours = (svg: string) => svg.match(/#[0-9A-F]{6}/gi)?.map((hex) => hex.toUpperCase())
const darkStyle = icon.match(/@media \(prefers-color-scheme: dark\) \{[^]*?\}\s*\}/)?.[0] ?? ''

describe("the tab's icon", () => {
  it("draws Perron's Mylder mark as drawn, on a square", () => {
    expect(shapes(icon)).toEqual(shapes(light))
    expect(icon).toContain('viewBox="0 -4 27 27"')
  })

  it("takes the light mark's colours, and the dark mark's when the browser is dark", () => {
    for (const colour of colours(light) ?? []) expect(colours(icon)).toContain(colour)
    const changed = colours(dark)?.filter((colour) => !colours(light)?.includes(colour))
    expect(changed).not.toHaveLength(0)
    for (const colour of changed ?? []) expect(colours(darkStyle)).toContain(colour)
  })
})
