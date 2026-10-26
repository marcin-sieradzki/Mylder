import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// From the repo's root, where the tests run.
const read = (path: string) => readFileSync(path, 'utf8')

const icon = read('app/icon.svg')
const [light, dark] = ['mylder-mark.svg', 'mylder-mark-dark.svg'].map((file) =>
  read(`node_modules/@mylder/perron/logos/${file}`),
)

/** A file's circles in order, the bus dot, the S-tog dot and the ring, without the icon's classes. */
const circles = (svg: string) =>
  [...svg.matchAll(/<circle [^>]*\/>/g)].map(([circle]) => circle.replace(/ class="\w+"/, ''))
const colourOf = (circle: string, paint: 'fill' | 'stroke') =>
  circle.match(new RegExp(`${paint}="(#[0-9A-F]{6})"`, 'i'))?.[1]
const darkStyle = icon.match(/@media \(prefers-color-scheme: dark\) \{[^]*?\}\s*\}/)?.[0] ?? ''

describe("the tab's icon", () => {
  it("draws Perron's Mylder mark as drawn, in its light colours, on a square", () => {
    expect(circles(light)).toHaveLength(3)
    expect(circles(icon)).toEqual(circles(light))
    expect(icon).toContain('viewBox="0 -4 27 27"')
  })

  it("takes the dark mark's colours when the browser is dark", () => {
    const [bus, line, ring] = circles(dark)
    expect(darkStyle).toContain(`.bus { fill: ${colourOf(bus, 'fill')} }`)
    expect(darkStyle).toContain(`.ring { stroke: ${colourOf(ring, 'stroke')} }`)
    expect(colourOf(line, 'fill')).toBe(colourOf(circles(light)[1], 'fill'))
  })
})
